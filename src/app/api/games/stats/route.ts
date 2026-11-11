import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/http";
import { dec } from "@/lib/money";

/** Per-game stats from GameResult: played / wins / losses / streak / best. */
export async function GET() {
  try {
    const user = await requireAuth();
    const rows = await prisma.gameResult.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: { game: true, stake: true, payout: true, createdAt: true },
    });
    const byGame = new Map<
      string,
      { played: number; wins: number; losses: number; best: number; streak: number; cur: number; streakSet: boolean }
    >();
    for (const r of rows) {
      const won = dec(r.payout) > dec(r.stake);
      const profit = dec(r.payout) - dec(r.stake);
      const cur = byGame.get(r.game) ?? { played: 0, wins: 0, losses: 0, best: 0, streak: 0, cur: 0, streakSet: false };
      cur.played += 1;
      if (won) cur.wins += 1;
      else cur.losses += 1;
      if (profit > cur.best) cur.best = profit;
      // Rows are newest-first, so the first run of wins is the current streak.
      if (!cur.streakSet) {
        if (won) cur.cur += 1;
        else {
          cur.streak = cur.cur;
          cur.streakSet = true;
        }
      }
      byGame.set(r.game, cur);
    }
    const stats = [...byGame.entries()].map(([game, s]) => ({
      game,
      played: s.played,
      wins: s.wins,
      losses: s.losses,
      streak: s.streakSet ? s.streak : s.cur,
      best: s.best,
    }));
    return ok({ stats });
  } catch (err) {
    return toErrorResponse(err);
  }
}
