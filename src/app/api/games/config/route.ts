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
import { getAllGameConfigs, getPlatformSettings } from "@/lib/game-config";

export async function GET() {
  await connection();
  try {
    const [games, settings] = await Promise.all([getAllGameConfigs(), getPlatformSettings()]);
    return ok({
      globalKill: settings.globalKill,
      // P1 Batch 4 (O21): the header reads the site name from here and
      // the homepage + game rooms read the maintenance flag.
      siteName: settings.siteName,
      maintenanceMode: settings.maintenanceMode,
      supportContact: settings.supportContact,
      games,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
