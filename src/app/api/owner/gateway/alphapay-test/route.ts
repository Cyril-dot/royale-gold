// Nov 2026 AlphaPay (Ghana only, docs.alphapay.me): the owner
// "Test connection" probe for the Ghana gateway. Calls GET
// /pricing/my-rates/ with the saved secret key (no payment is
// created). A 200 means the key is valid; a 401/403 means AlphaPay
// rejected it. The Ghana rows prove the account can collect on
// mtn_gh / telecel_gh / airteltigo_gh. Mirrors the Flutterwave test
// route (GET /v3/banks/NG there).
import { requireRole } from "@/lib/auth";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { AlphaPayError, getMyRates } from "@/lib/alphapay";

const GHANA_NETWORKS = ["mtn_gh", "telecel_gh", "airteltigo_gh"] as const;

/** Pull the Ghana payin networks out of a my-rates response of unknown shape. */
function extractGhanaNetworks(rates: unknown): string[] {
  const list: unknown[] = Array.isArray(rates)
    ? rates
    : rates && typeof rates === "object" && Array.isArray((rates as Record<string, unknown>).data)
      ? ((rates as Record<string, unknown>).data as unknown[])
      : rates && typeof rates === "object"
        ? Object.values(rates as Record<string, unknown>)
        : [];
  const found = new Set<string>();
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const network = String(e.network ?? e.network_code ?? "");
    const country = String(e.country ?? e.country_code ?? e.iso_code ?? "");
    const payin = e.payin as Record<string, unknown> | undefined;
    const available = payin ? payin.available !== false : true;
    if (available && (GHANA_NETWORKS as readonly string[]).includes(network)) {
      found.add(network);
    } else if (available && country.toUpperCase() === "GH" && network) {
      found.add(network);
    }
  }
  return [...found];
}

export async function POST() {
  try {
    await requireRole("owner");
    const rates = await getMyRates();
    const ghanaNetworks = extractGhanaNetworks(rates);
    return ok({ authenticated: true, ghanaNetworks, ratesFound: ghanaNetworks.length });
  } catch (err) {
    if (err instanceof AlphaPayError) return fail(err.message, err.statusCode);
    return toErrorResponse(err);
  }
}
