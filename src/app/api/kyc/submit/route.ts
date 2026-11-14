// P1 Batch 2 (A21): the player's own KYC submission — a document type
// + a link to their ID document. There is no file-hosting infra in this
// repo, so the document is a URL the player pastes and the admin
// verifies from the URL. KYC is informational ONLY — submitting (or
// not submitting) never blocks deposits or play.
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { isKycDocumentType, KYC_DOCUMENT_LABELS } from "@/lib/kyc";

export async function POST(req: Request) {
  try {
    const me = await requireAuth();
    const body = await readJson<{ documentType?: string; documentUrl?: string }>(req);
    if (!body) return fail("Invalid JSON body");
    if (!isKycDocumentType(body.documentType)) {
      return fail("documentType must be national_id, passport or drivers_licence");
    }
    const documentUrl = (body.documentUrl ?? "").trim();
    if (documentUrl.length < 8 || documentUrl.length > 2000) return fail("Paste the link to your document");
    if (!/^https?:\/\//i.test(documentUrl)) return fail("The document link must start with http:// or https://");
    // One submission under review at a time — after a rejection (or an
    // approval) the player may submit again.
    const pending = await prisma.kycSubmission.findFirst({
      where: { userId: me.id, status: "pending" },
    });
    if (pending) return fail("You already have a submission under review", 409);
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.kycSubmission.create({
        data: { userId: me.id, documentType: body.documentType as string, documentUrl, status: "pending" },
      });
      await tx.auditLog.create({
        data: {
          actorId: me.id, action: "kyc.submit", targetId: created.id,
          detail: `KYC: ${me.name} submitted a ${KYC_DOCUMENT_LABELS[body.documentType as keyof typeof KYC_DOCUMENT_LABELS]}`,
        },
      });
      return created;
    });
    return ok({
      submission: {
        id: row.id,
        documentType: row.documentType,
        documentUrl: row.documentUrl,
        status: row.status,
        submittedAt: row.createdAt.toISOString(),
      },
    }, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
