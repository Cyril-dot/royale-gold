// P1 Batch 2 (A21): the player's latest KYC submission (or null when
// never submitted). The account page reads this for the KYC section.
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/http";
import { KYC_DOCUMENT_LABELS } from "@/lib/kyc";

export async function GET() {
  try {
    const me = await requireAuth();
    const row = await prisma.kycSubmission.findFirst({
      where: { userId: me.id },
      orderBy: { createdAt: "desc" },
    });
    if (!row) return ok({ submission: null });
    return ok({
      submission: {
        id: row.id,
        documentType: row.documentType,
        documentTypeLabel: KYC_DOCUMENT_LABELS[row.documentType as keyof typeof KYC_DOCUMENT_LABELS] ?? row.documentType,
        documentUrl: row.documentUrl,
        status: row.status,
        submittedAt: row.createdAt.toISOString(),
        reviewedAt: row.reviewedAt?.toISOString() ?? null,
        rejectionReason: row.rejectionReason,
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
