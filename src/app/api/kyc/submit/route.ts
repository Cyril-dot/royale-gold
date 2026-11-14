// P1 Batch 2 (A21): the player's own KYC submission — a document type
// + a link to their ID document. There is no file-hosting infra in this
// repo, so the document is a URL the player pastes and the admin
// verifies from the URL. KYC is informational ONLY — submitting (or
// not submitting) never blocks deposits or play.
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { isKycDocumentType, KYC_DOCUMENT_LABELS } from "@/lib/kyc";
import { getKycSettings, hostIsAllowListed } from "@/lib/kyc-settings";

export async function POST(req: Request) {
  try {
    const me = await requireAuth();
    const body = await readJson<{ documentType?: string; documentUrl?: string }>(req);
    if (!body) return fail("Invalid JSON body");
    if (!isKycDocumentType(body.documentType)) {
      return fail("documentType must be national_id, passport or drivers_licence");
    }
    // P1 Batch 4 (O22): the accepted document types come from the
    // owner's KYC settings — a type the owner removed is not accepted.
    const settings = await getKycSettings();
    if (!settings.acceptedTypes.includes(body.documentType)) {
      return fail(`${KYC_DOCUMENT_LABELS[body.documentType]} is not accepted right now`);
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
    // P1 Batch 4 (O22): the auto-approve rule — when ON, a submission
    // whose document URL host is on the owner's allow-list is approved
    // at once. This is a URL-host check, NOT a document check (there is
    // no verification service); the submission stays visible in the
    // queue as "auto-approved".
    const autoApproved = settings.autoApprove && hostIsAllowListed(documentUrl, settings.autoApproveHosts);
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.kycSubmission.create({
        data: {
          userId: me.id,
          documentType: body.documentType as string,
          documentUrl,
          status: autoApproved ? "approved" : "pending",
          autoApproved,
          reviewedBy: autoApproved ? me.id : null,
          reviewedAt: autoApproved ? new Date() : null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: me.id,
          action: autoApproved ? "kyc.approve" : "kyc.submit",
          targetId: created.id,
          detail: autoApproved
            ? `KYC: ${me.name}'s ${KYC_DOCUMENT_LABELS[body.documentType as keyof typeof KYC_DOCUMENT_LABELS]} auto-approved (allow-listed host)`
            : `KYC: ${me.name} submitted a ${KYC_DOCUMENT_LABELS[body.documentType as keyof typeof KYC_DOCUMENT_LABELS]}`,
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
        autoApproved: row.autoApproved,
        submittedAt: row.createdAt.toISOString(),
      },
    }, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
