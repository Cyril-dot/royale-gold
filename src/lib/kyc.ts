// P1 Batch 2 (A21): KYC — the real submission + review flow.
//
// There was no KYC model before this batch (Batch 4 left a
// "Not submitted" placeholder on the player detail). A player submits
// a document type + a link to their ID document; an admin (own
// downline only) approves or rejects it. KYC is informational ONLY —
// it never blocks deposits or play (standing order).
//
// The document is a URL the player pastes. There is no file-hosting
// infra in this repo, so no storage backend is invented; the admin
// verifies from the URL.

import { prisma } from "./prisma";

export const KYC_DOCUMENT_TYPES = ["national_id", "passport", "drivers_licence"] as const;
export type KycDocumentType = (typeof KYC_DOCUMENT_TYPES)[number];

export const KYC_DOCUMENT_LABELS: Record<KycDocumentType, string> = {
  national_id: "National ID",
  passport: "Passport",
  drivers_licence: "Driver's licence",
};

export function isKycDocumentType(value: unknown): value is KycDocumentType {
  return typeof value === "string" && (KYC_DOCUMENT_TYPES as readonly string[]).includes(value);
}

export type KycStatus = "not_submitted" | "pending" | "approved" | "rejected";

export interface KycStatusRow {
  status: KycStatus;
  documentType: string | null;
  documentUrl: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
}

/** The player's current KYC state — the latest submission wins. */
export async function latestKycStatus(userId: string): Promise<KycStatusRow> {
  const row = await prisma.kycSubmission.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  if (!row) {
    return {
      status: "not_submitted",
      documentType: null,
      documentUrl: null,
      submittedAt: null,
      reviewedAt: null,
      rejectionReason: null,
    };
  }
  return {
    status: row.status as KycStatus,
    documentType: row.documentType,
    documentUrl: row.documentUrl,
    submittedAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    rejectionReason: row.rejectionReason,
  };
}
