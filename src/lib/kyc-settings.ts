// P1 Batch 4 (O22) — owner-level KYC/AML settings.
//
// A dedicated KycSettings row (id always "global"), separate from
// PlatformSettings: a distinct settings domain with its own endpoint.
// - acceptedTypes: the document types the player submit form offers
//   (comma-separated; default all three).
// - autoApprove: OFF by default. When ON, a submission is auto-approved
//   ONLY when its document URL host is on the allow-list
//   (autoApproveHosts, comma-separated, e.g. "imgbb.com"). This is a
//   URL-host check, NOT a document check — there is no verification
//   service. An auto-approved submission stays visible in the queue as
//   "auto-approved".
// - withdrawalKycThreshold (GH₵, 0 = no requirement): withdrawal
//   requests above it from players whose KYC is not Approved get a
//   "KYC required" flag on the queue — a warning, NEVER a block.
import { prisma } from "./prisma";
import { dec } from "./money";
import { isKycDocumentType, type KycDocumentType } from "./kyc";

export interface KycSettingsShape {
  acceptedTypes: KycDocumentType[];
  autoApprove: boolean;
  autoApproveHosts: string[];
  withdrawalKycThreshold: number;
}

export const KYC_SETTINGS_DEFAULTS: KycSettingsShape = {
  acceptedTypes: ["national_id", "passport", "drivers_licence"],
  autoApprove: false,
  autoApproveHosts: [],
  withdrawalKycThreshold: 0,
};

function parseTypes(raw: string): KycDocumentType[] {
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => isKycDocumentType(s));
  return list.length > 0 ? list : [...KYC_SETTINGS_DEFAULTS.acceptedTypes];
}

function parseHosts(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** The settings row, or the defaults when no row exists yet. */
export async function getKycSettings(): Promise<KycSettingsShape> {
  const row = await prisma.kycSettings.findUnique({ where: { id: "global" } });
  if (!row) return { ...KYC_SETTINGS_DEFAULTS };
  return {
    acceptedTypes: parseTypes(row.acceptedTypes),
    autoApprove: row.autoApprove,
    autoApproveHosts: parseHosts(row.autoApproveHosts),
    withdrawalKycThreshold: dec(row.withdrawalKycThreshold),
  };
}

/** True when the document URL's host is on the auto-approve allow-list. */
export function hostIsAllowListed(documentUrl: string, hosts: string[]): boolean {
  if (hosts.length === 0) return false;
  try {
    const host = new URL(documentUrl).hostname.toLowerCase();
    return hosts.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/** Validate a settings write from the owner panel. Returns the error or null. */
export function validateKycSettings(body: {
  acceptedTypes?: unknown;
  autoApprove?: unknown;
  autoApproveHosts?: unknown;
  withdrawalKycThreshold?: unknown;
}): string | null {
  if (body.acceptedTypes !== undefined) {
    if (!Array.isArray(body.acceptedTypes) || body.acceptedTypes.length === 0) {
      return "acceptedTypes must be a non-empty list of document types";
    }
    for (const t of body.acceptedTypes) {
      if (!isKycDocumentType(t)) return `Unknown document type: ${String(t)}`;
    }
  }
  if (body.autoApprove !== undefined && typeof body.autoApprove !== "boolean") {
    return "autoApprove must be true or false";
  }
  if (body.autoApproveHosts !== undefined && typeof body.autoApproveHosts !== "string") {
    return "autoApproveHosts must be a comma-separated list of hosts";
  }
  if (body.withdrawalKycThreshold !== undefined) {
    const n = Number(body.withdrawalKycThreshold);
    if (!Number.isFinite(n) || n < 0) return "withdrawalKycThreshold must be GH₵ 0 or more";
  }
  return null;
}
