// P0 Batch 2 (O9/O10/O11): the owner's game catalogue — all 46 games
// with their effective config (catalogue defaults overlaid with the
// owner's row where one exists).
import { requireRole } from "@/lib/auth";
import { ok, toErrorResponse } from "@/lib/http";
import { getAllGameConfigs } from "@/lib/game-config";

export async function GET() {
  try {
    await requireRole("owner");
    const games = await getAllGameConfigs();
    return ok({ games });
  } catch (err) {
    return toErrorResponse(err);
  }
}
