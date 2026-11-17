// P0 Batch 1 (A5/O8): an admin decides a withdrawal in their queue.
// Maker-checker: approving a LARGE amount (over the per-fiat threshold
// — GH₵ 500 / ₦ 50,000 seed) does NOT finish it — it moves to
// "admin_approved" and waits for the owner's second approval.
// Approving a small amount finishes it ("approved"). Rejecting needs a
// reason. No money moves on any decision — requests only.
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { dec } from "@/lib/money";
import { symbolFor } from "@/lib/country";
import { needsOwnerApproval, withdrawalOwnerThresholdFor } from "@/lib/withdrawals";

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

    const w = await prisma.withdrawal.findUnique({ where: { id } });
    if (!w) return fail("Withdrawal not found", 404);
    if (w.adminId !== admin.id) return fail("This withdrawal is not in your queue", 404);
    if (w.status !== "pending" && w.status !== "held") return fail(`This withdrawal is already ${w.status}`, 400);

    const amount = dec(w.amount);
    const fiatCurrency = w.fiatCurrency ?? "GHS";
    const threshold = await withdrawalOwnerThresholdFor(fiatCurrency);
    const nextStatus = decision === "reject" ? "rejected" : (await needsOwnerApproval(amount, fiatCurrency)) ? "admin_approved" : "approved";
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.withdrawal.update({
        where: { id },
        data: {
          status: nextStatus,
          ...(decision === "approve" && nextStatus === "admin_approved" ? { adminApprovedAt: new Date() } : {}),
          decidedBy: admin.id,
          reason: decision === "reject" ? reason : w.reason,
          decidedAt: nextStatus === "approved" || nextStatus === "rejected" ? new Date() : undefined,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          action: decision === "approve" ? "withdrawal.approve" : "withdrawal.reject",
          targetId: w.id,
          detail: `${decision === "approve" ? "Approved" : "Rejected"} withdrawal of ${amount} ${fiatCurrency} for user ${w.userId}${nextStatus === "admin_approved" ? ` — over ${symbolFor(fiatCurrency)} ${threshold}, awaiting owner` : ""}${decision === "reject" ? ` — ${reason}` : ""}`,
        },
      });
      return u;
    });

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
