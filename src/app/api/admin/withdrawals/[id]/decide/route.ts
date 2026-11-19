// P0 Batch 1 (A5/O8): an admin decides a withdrawal in their queue.
// Maker-checker: approving a LARGE amount (over the per-fiat threshold
// — GH₵ 500 / ₦ 50,000 seed) does NOT finish it — it moves to
// "admin_approved" and waits for the owner's second approval.
// Approving a small amount finishes it ("approved") AND debits the
// player's cash (Winnings first — see debitWithdrawal in
// src/lib/win-logic.ts), atomically with the status flip. Rejecting
// debits the player's cash EXACTLY the same way (his rule, Nov 2026:
// money leaves on approve AND reject). Rejecting needs a reason.
// The request itself debits nothing — only the decision does.
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { dec } from "@/lib/money";
import { symbolFor } from "@/lib/country";
import { needsOwnerApproval, withdrawalOwnerThresholdFor } from "@/lib/withdrawals";
import { debitWithdrawal } from "@/lib/win-logic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "money");
    const { id } = await params;
    const body = await readJson<{ decision?: string; reason?: string }>(req);
    if (!body) return fail("Invalid JSON body");
    const decision = body.decision;
    if (decision !== "approve" && decision !== "reject") return fail("decision must be approve or reject");
    const reason = (body.reason ?? "").trim();
    if (decision === "reject" && !reason) return fail("A reason is required to reject a withdrawal");

    // Phase 5 (admin 500s): select only the columns this route reads —
    // an unfiltered select also pulls newer columns
    // (accountType/accountName/accountDetail) that prod may not have
    // yet, and the whole query throws. Same for the update below: its
    // returned row is the only shape the response maps.
    const w = await prisma.withdrawal.findUnique({
      where: { id },
      select: { id: true, userId: true, adminId: true, amount: true, fiatCurrency: true, status: true, reason: true },
    });
    if (!w) return fail("Withdrawal not found", 404);
    if (w.adminId !== admin.id) return fail("This withdrawal is not in your queue", 404);
    if (w.status !== "pending" && w.status !== "held") return fail(`This withdrawal is already ${w.status}`, 400);

    const amount = dec(w.amount);
    const fiatCurrency = w.fiatCurrency ?? "GHS";
    const threshold = await withdrawalOwnerThresholdFor(fiatCurrency);
    const nextStatus = decision === "reject" ? "rejected" : (await needsOwnerApproval(amount, fiatCurrency)) ? "admin_approved" : "approved";
    const finalApproval = nextStatus === "approved";

    // Marker errors thrown inside the transaction roll it back and are
    // mapped to 400s below — the status never flips on a failed debit.
    let updated: { id: string; status: string; decidedAt: Date | null };
    try {
      const out = await prisma.$transaction(async (tx) => {
        // Authoritative guard, INSIDE the transaction: the flip only
        // matches a still-pending/held row, so two concurrent approves
        // cannot both land — the second matches 0 rows. (The pre-read
        // above is only the early error for the common case.)
        const flipped = await tx.withdrawal.updateMany({
          where: { id, status: { in: ["pending", "held"] } },
          data: {
            status: nextStatus,
            ...(decision === "approve" && nextStatus === "admin_approved" ? { adminApprovedAt: new Date() } : {}),
            decidedBy: admin.id,
            reason: decision === "reject" ? reason : w.reason,
            decidedAt: nextStatus === "approved" || nextStatus === "rejected" ? new Date() : undefined,
          },
        });
        if (flipped.count === 0) throw new Error("ALREADY_DECIDED: this withdrawal was already decided");
        // Nov 2026 (withdrawal-debit fix): final approval debits the
        // player's cash, Winnings first — atomically with the flip.
        // admin_approved debits NOTHING yet; the owner's second
        // approval is what debits. Rejecting debits exactly the same
        // way (his rule, Nov 2026: money leaves on approve AND reject).
        let d: { newCash: number; drawnFromWinnings: number } | null = null;
        if (finalApproval || decision === "reject") d = await debitWithdrawal(tx, w.userId, amount);
        await tx.auditLog.create({
          data: {
            actorId: admin.id,
            action: decision === "approve" ? "withdrawal.approve" : "withdrawal.reject",
            targetId: w.id,
            detail: `${decision === "approve" ? "Approved" : "Rejected"} withdrawal of ${amount} ${fiatCurrency} for user ${w.userId}${nextStatus === "admin_approved" ? ` — over ${symbolFor(fiatCurrency)} ${threshold}, awaiting owner` : ""}${decision === "reject" ? ` — ${reason}` : ""}${d ? ` — debited ${amount} ${fiatCurrency}${d.drawnFromWinnings > 0 ? ` (${d.drawnFromWinnings} from Winnings)` : ""}, new cash balance ${d.newCash} ${fiatCurrency}` : ""}`,
          },
        });
        // Phase 5 (admin 500s): explicit select — the returned row is
        // the only shape the response maps.
        const row = await tx.withdrawal.findUnique({
          where: { id },
          select: { id: true, status: true, decidedAt: true },
        });
        if (!row) throw new Error("Withdrawal not found");
        return row;
      });
      updated = out;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("ALREADY_DECIDED")) {
        return fail("This withdrawal was already decided", 400);
      }
      if (err instanceof Error && err.message.startsWith("INSUFFICIENT_BALANCE")) {
        // Nov 2026: rejecting debits exactly like approving, so a
        // short balance blocks BOTH decisions — the balance must reach
        // the amount first (deposit or manual credit) before this
        // withdrawal can be decided at all.
        return fail(`Cannot ${decision} — the player's cash balance is below the ${amount} ${fiatCurrency} withdrawal. The balance must reach ${amount} ${fiatCurrency} first (deposit or manual credit) before this can be decided.`, 400);
      }
      throw err;
    }

    return ok({
      withdrawal: { id: updated.id, status: updated.status, decidedAt: updated.decidedAt?.toISOString() ?? null },
      note: nextStatus === "admin_approved"
        ? `Over ${symbolFor(fiatCurrency)} ${threshold} — the owner must approve it second before it is final.`
        : undefined,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
