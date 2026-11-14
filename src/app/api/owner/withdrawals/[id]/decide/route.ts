// P0 Batch 1 (O8): the owner decides a withdrawal. The owner may approve
// any pending or admin_approved withdrawal — approving an admin_approved
// one is the maker's second check that makes it final. The owner may also
// approve a pending one directly. Rejecting needs a reason. No money
// moves on any decision — requests only.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { dec } from "@/lib/money";

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

    const w = await prisma.withdrawal.findUnique({ where: { id } });
    if (!w) return fail("Withdrawal not found", 404);
    if (w.status !== "pending" && w.status !== "admin_approved" && w.status !== "held") {
      return fail(`This withdrawal is already ${w.status}`, 400);
    }

    const nextStatus = decision === "reject" ? "rejected" : "approved";
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.withdrawal.update({
        where: { id },
        data: {
          status: nextStatus,
          decidedBy: owner.id,
          reason: decision === "reject" ? reason : w.reason,
          decidedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: owner.id,
          action: decision === "approve" ? "withdrawal.approve" : "withdrawal.reject",
          targetId: w.id,
          detail: `Owner ${decision === "approve" ? "approved" : "rejected"} withdrawal of ${dec(w.amount)} for user ${w.userId} (was ${w.status})${decision === "reject" ? ` — ${reason}` : ""}`,
        },
      });
      return u;
    });

    return ok({
      withdrawal: { id: updated.id, status: updated.status, decidedAt: updated.decidedAt?.toISOString() ?? null },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
