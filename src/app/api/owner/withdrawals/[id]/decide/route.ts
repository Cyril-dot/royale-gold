// P0 Batch 1 (O8): the owner decides a withdrawal. The owner may approve
// any pending or admin_approved withdrawal — approving an admin_approved
// one is the maker's second check that makes it final. The owner may also
// approve a pending one directly. Rejecting needs a reason. Approving
// debits the player's cash (Winnings first — see debitWithdrawal in
// src/lib/win-logic.ts), atomically with the status flip; rejecting
// debits exactly the same way (his rule, Nov 2026: money leaves on
// approve AND reject). The request itself debits nothing — only the
// decision does.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { dec } from "@/lib/money";
import { debitWithdrawal } from "@/lib/win-logic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const owner = await requireRole("owner");
    const { id } = await params;
    const body = await readJson<{ decision?: string; reason?: string }>(req);
    if (!body) return fail("Invalid JSON body");
    const decision = body.decision;
    if (decision !== "approve" && decision !== "reject") return fail("decision must be approve or reject");
    const reason = (body.reason ?? "").trim();
    if (decision === "reject" && !reason) return fail("A reason is required to reject a withdrawal");

    // Explicit select (not the old unselected findUnique): an
    // unfiltered select also pulls newer columns (accountType /
    // accountName / accountDetail) that prod may not have yet, and the
    // whole query throws — the 17 Nov owner-500s lesson (3833bdf).
    const w = await prisma.withdrawal.findUnique({
      where: { id },
      select: { id: true, userId: true, amount: true, fiatCurrency: true, status: true, reason: true },
    });
    if (!w) return fail("Withdrawal not found", 404);
    if (w.status !== "pending" && w.status !== "admin_approved" && w.status !== "held") {
      return fail(`This withdrawal is already ${w.status}`, 400);
    }

    const amount = dec(w.amount);
    const fiatCurrency = w.fiatCurrency ?? "GHS";
    const nextStatus = decision === "reject" ? "rejected" : "approved";

    // Marker errors thrown inside the transaction roll it back and are
    // mapped to 400s below — the status never flips on a failed debit.
    let updated: { id: string; status: string; decidedAt: Date | null };
    try {
      const out = await prisma.$transaction(async (tx) => {
        // Authoritative guard, INSIDE the transaction: the flip only
        // matches a still-pending/admin_approved/held row, so two
        // concurrent approves cannot both land — the second matches 0
        // rows. (The pre-read above is only the early error for the
        // common case.)
        const flipped = await tx.withdrawal.updateMany({
          where: { id, status: { in: ["pending", "admin_approved", "held"] } },
          data: {
            status: nextStatus,
            decidedBy: owner.id,
            reason: decision === "reject" ? reason : w.reason,
            decidedAt: new Date(),
          },
        });
        if (flipped.count === 0) throw new Error("ALREADY_DECIDED: this withdrawal was already decided");
        // Nov 2026 (withdrawal-debit fix): final approval debits the
        // player's cash, Winnings first — atomically with the flip.
        // Rejecting debits exactly the same way (his rule, Nov 2026:
        // money leaves on approve AND reject).
        let d: { newCash: number; drawnFromWinnings: number } | null = null;
        if (decision === "approve" || decision === "reject") d = await debitWithdrawal(tx, w.userId, amount);
        await tx.auditLog.create({
          data: {
            actorId: owner.id,
            action: decision === "approve" ? "withdrawal.approve" : "withdrawal.reject",
            targetId: w.id,
            detail: `Owner ${decision === "approve" ? "approved" : "rejected"} withdrawal of ${amount} ${fiatCurrency} for user ${w.userId} (was ${w.status})${decision === "reject" ? ` — ${reason}` : ""}${d ? ` — debited ${amount} ${fiatCurrency}${d.drawnFromWinnings > 0 ? ` (${d.drawnFromWinnings} from Winnings)` : ""}, new cash balance ${d.newCash} ${fiatCurrency}` : ""}`,
          },
        });
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
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
