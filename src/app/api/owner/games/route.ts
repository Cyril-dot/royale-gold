// P0 Batch 2 (O9/O10/O11): the owner's game catalogue — all 46 games
// with their effective config (catalogue defaults overlaid with the
// owner's row where one exists).
//
// Win controls (Nov 2026): also carries each game's per-game win
// chance (winChances, keyed by slug — null where unset) and the list
// of server-drawn games the chance is enforced for (playGated).
// The PUBLIC GET /api/games/config deliberately does NOT carry the
// chance — it is the owner's dial and must never reach players.
// The owner Games page loads THIS endpoint, not the public one.
import { requireRole } from "@/lib/auth";
import { ok, toErrorResponse } from "@/lib/http";
import { getAllGameConfigs, getAllGameWinChances, getPlatformSettings } from "@/lib/game-config";
import { PLAY_GATED_GAMES } from "@/lib/play";

export async function GET() {
  try {
    await requireRole("owner");
    const [games, settings, winChances] = await Promise.all([
      getAllGameConfigs(),
      getPlatformSettings(),
      getAllGameWinChances(),
    ]);
    return ok({
      games,
      globalKill: settings.globalKill,
      winChances,
      playGated: [...PLAY_GATED_GAMES],
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
