// P2 Batch 2 (O27): game replays — the 50 most recent GameResult
// rows platform-wide, with player + game + stake + payout + net +
// time + roundId. A replay is a READ of the existing GameResult +
// CrashRound tables: there is no per-bet event log to replay from,
// so a replay shows the round's outcome + the provably-fair verify
// result (the detail route), not a step-by-step animation — the owner
// page says so plainly. Nothing is recorded here.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/http";
import { dec, round2 } from "@/lib/money";
import { getGame } from "@/lib/games";
import { roundIdOfGameResult } from "@/lib/verify";

export async function GET() {
  try {
    await requireRole("owner");
    const rows = await prisma.gameResult.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: { id: true, name: true } } },
    });
    return ok({
      replays: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        userName: r.user?.name ?? "Unknown",
        game: r.game,
        gameName: getGame(r.game)?.name ?? r.game,
        currency: r.currency,
        // Phase 1 country-based (Nov 2026): the fiat this round was played in.
        fiatCurrency: r.fiatCurrency ?? "GHS",
        stake: dec(r.stake),
        payout: dec(r.payout),
        net: round2(dec(r.payout) - dec(r.stake)),
        roundId: roundIdOfGameResult(r.result),
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
