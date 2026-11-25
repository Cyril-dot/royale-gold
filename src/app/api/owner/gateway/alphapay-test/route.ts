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

/** One Ghana network's payin availability, as my-rates reports it. */
interface GhanaNetworkAvailability {
  network: string;
  available: boolean;
}

/**
 * Pull the Ghana payin networks out of a my-rates response of unknown
 * shape. A network is usable for payin ONLY when its payin block
 * says so — a row with NO payin block at all is NOT available. The
 * old read defaulted a missing payin block to available, which is
 * how mtn_gh passed Test connection while softpay 422'd "no provider
 * available" for it. The three documented Ghana networks always
 * report, even when my-rates has no row for one at all (no row =
 * no payin); any other GH-country network in the response (live
 * my-rates uses tigo_gh / vodafone_gh) reports after them.
 */
function extractGhanaAvailability(rates: unknown): GhanaNetworkAvailability[] {
  const list: unknown[] = Array.isArray(rates)
    ? rates
    : rates && typeof rates === "object" && Array.isArray((rates as Record<string, unknown>).data)
      ? ((rates as Record<string, unknown>).data as unknown[])
      : rates && typeof rates === "object"
        ? Object.values(rates as Record<string, unknown>)
        : [];
  const byNetwork = new Map<string, boolean>();
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const network = String(e.network ?? e.network_code ?? "");
    if (!network) continue;
    const country = String(e.country ?? e.country_code ?? e.iso_code ?? "");
    const isGhana =
      (GHANA_NETWORKS as readonly string[]).includes(network) || country.toUpperCase() === "GH";
    if (!isGhana) continue;
    const payin = e.payin as Record<string, unknown> | undefined;
    const available = payin ? payin.available !== false : false;
    if (!byNetwork.has(network)) byNetwork.set(network, available);
  }
  const ordered: string[] = [...GHANA_NETWORKS];
  for (const network of byNetwork.keys()) {
    if (!ordered.includes(network)) ordered.push(network);
  }
  return ordered.map((network) => ({ network, available: byNetwork.get(network) ?? false }));
}

export async function POST() {
  try {
    await requireRole("owner");
    const rates = await getMyRates();
    const networks = extractGhanaAvailability(rates);
    const ghanaNetworks = networks.filter((n) => n.available).map((n) => n.network);
    return ok({ authenticated: true, ghanaNetworks, ratesFound: ghanaNetworks.length, networks });
  } catch (err) {
    if (err instanceof AlphaPayError) return fail(err.message, err.statusCode);
    return toErrorResponse(err);
  }
}
