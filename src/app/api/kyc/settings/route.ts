// P1 Batch 4 (O22): the public KYC settings read — the player submit
// form reads the accepted document types from here, so the owner can
// narrow the list without a code change. No auth required.
//
// MUST stay dynamic (await connection() below): without it Next bakes
// the response at build time (○ static) and settings changes never
// reach the player form until a rebuild. (export const dynamic is
// incompatible with this repo's cacheComponents setting.)
import { connection } from "next/server";
import { ok, toErrorResponse } from "@/lib/http";
import { getKycSettings } from "@/lib/kyc-settings";
import { KYC_DOCUMENT_LABELS } from "@/lib/kyc";

export async function GET() {
  await connection();
  try {
    const s = await getKycSettings();
    return ok({
      acceptedTypes: s.acceptedTypes,
      labels: Object.fromEntries(s.acceptedTypes.map((t) => [t, KYC_DOCUMENT_LABELS[t]])),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
