// P0 Batch 2 (O9/O11): the public game catalogue config — what the
// games page and the room gate read to hide/kill games. No auth: the
// values are platform rules a player can already see (a hidden game is
// gone from the list; a killed game says so in its room). Defaults are
// filled from the catalogue, so the client never needs games.ts.
//
// MUST stay dynamic (await connection() below): without it Next bakes
// the response at build time (○ static) and hides/kills never reach the
// games page or the room gate. (export const dynamic is incompatible
// with this repo's cacheComponents setting.)
import { connection } from "next/server";
import { ok, toErrorResponse } from "@/lib/http";
import { getAllCurrencyConfigs, getAllGameConfigs, getPlatformSettings } from "@/lib/game-config";
import { getSessionUser } from "@/lib/auth";
import { getGhMomoGateway, getNgGateway } from "@/lib/gateway-settings";

export async function GET() {
  await connection();
  try {
    const [games, settings, currencies, gateway, ngGateway] = await Promise.all([
      getAllGameConfigs(),
      getPlatformSettings(),
      getAllCurrencyConfigs(),
      getGhMomoGateway(),
      getNgGateway(),
    ]);
    // Phase 2 PayTeller (Nov 2026): the deposit UI reads the live
    // Ghana gateway + the signed-in user's fiat from here — no new
    // round-trip. Signed out, currency is null (the picker defaults).
    const me = await getSessionUser().catch(() => null);
    return ok({
      globalKill: settings.globalKill,
      // P1 Batch 4 (O21): the header reads the site name from here and
      // the homepage + game rooms read the maintenance flag.
      siteName: settings.siteName,
      maintenanceMode: settings.maintenanceMode,
      supportContact: settings.supportContact,
      games,
      // Phase 1 country-based (Nov 2026): the enabled per-currency
      // rules (min deposit/stake, conversion rate) so the client can
      // show the right numbers for the player's fiat without auth.
      currencies: currencies.filter((c) => c.enabled),
      currency: me?.currency ?? null,
      ghMomoGateway: gateway,
      // Nov 2026 Flutterwave v3 (Nigeria only): the deposit UI reads
      // the live Nigeria gateway from here, next to Ghana's.
      ngGateway,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
