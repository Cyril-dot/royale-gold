// P1 Batch 2 (A21): decide a KYC submission — approve, or reject with
// a mandatory reason. An admin may only decide their own downline's
// submissions; the owner may decide any (the owner reviews "as an
// admin" from the preview). Only a PENDING submission can be decided.
// KYC is informational ONLY — the decision never blocks deposits or
// play; it is recorded on the submission + the audit log.
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { KYC_DOCUMENT_LABELS } from "@/lib/kyc";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireRole("admin", "owner");
    if (me.role === "admin") requirePermission(me, "kyc");
    const { id } = await params;
    const body = await readJson<{ decision?: string; reason?: string }>(req);
    if (!body) return fail("Invalid JSON body");
    const decision = body.decision;
    if (decision !== "approved" && decision !== "rejected") return fail("decision must be approved or rejected");
    const reason = (body.reason ?? "").trim();
    if (decision === "rejected" && reason.length < 3) {
      return fail("A reason is required to reject (at least 3 characters)");
    }
    const row = await prisma.kycSubmission.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true, referredByAdminId: true } } },
    });
    if (!row) return fail("Submission not found", 404);
    if (me.role === "admin" && row.user.referredByAdminId !== me.id) {
      return fail("This player was not referred by you", 404);
    }
    if (row.status !== "pending") return fail(`This submission was already ${row.status}`, 400);
    const updated = await prisma.$transaction(async (tx) => {
      const done = await tx.kycSubmission.update({
        where: { id },
        data: {
          status: decision,
          reviewedBy: me.id,
          reviewedAt: new Date(),
          rejectionReason: decision === "rejected" ? reason : null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: me.id,
          action: decision === "approved" ? "kyc.approve" : "kyc.reject",
          targetId: row.userId,
          detail: `KYC: ${decision === "approved" ? "approved" : "rejected"} ${row.user.name}'s ${KYC_DOCUMENT_LABELS[row.documentType as keyof typeof KYC_DOCUMENT_LABELS] ?? row.documentType}${decision === "rejected" ? ` — ${reason}` : ""}`,
        },
      });
      return done;
    });
    return ok({
      submission: {
        id: updated.id,
        status: updated.status,
        reviewedAt: updated.reviewedAt?.toISOString() ?? null,
        rejectionReason: updated.rejectionReason,
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
