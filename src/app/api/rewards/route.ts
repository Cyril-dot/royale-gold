import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/http";
import { dec, todayStr } from "@/lib/money";
import { ACHIEVEMENTS, currentStreak } from "@/lib/rewards";

export async function GET() {
  try {
    const user = await requireAuth();
    const today = todayStr();
    const [claims, results, unlocked] = await Promise.all([
      prisma.dailyClaim.findMany({ where: { userId: user.id, claimedDate: today } }),
      prisma.gameResult.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        select: { currency: true, stake: true, payout: true },
      }),
      prisma.achievement.findMany({ where: { userId: user.id } }),
    ]);

    const wins = results.filter((r) => dec(r.payout) > dec(r.stake)).length;
    const cashWins = results.filter((r) => r.currency === "cash" && dec(r.payout) > 0).length;
    // Best consecutive-win streak (results are newest-first).
    let bestStreak = 0;
    let run = 0;
    for (const r of [...results].reverse()) {
      if (dec(r.payout) > dec(r.stake)) {
        run += 1;
        bestStreak = Math.max(bestStreak, run);
      } else run = 0;
    }
    const progress: Record<string, number> = {
      "first-win": wins,
      "streak-3": bestStreak,
      "games-10": results.length,
      "first-cashout": cashWins,
    };
    const unlockedKeys = new Set(unlocked.map((a) => a.key));
    // Unlock anything whose threshold is met (idempotent — unique per user+key).
    const newlyUnlocked = ACHIEVEMENTS.filter(
      (a) => progress[a.key] >= a.target && !unlockedKeys.has(a.key),
    );
    if (newlyUnlocked.length > 0) {
      // Upsert per key (createMany skipDuplicates is not supported on SQLite).
      for (const a of newlyUnlocked) {
        await prisma.achievement.upsert({
          where: { userId_key: { userId: user.id, key: a.key } },
          update: {},
          create: { userId: user.id, key: a.key },
        });
      }
      newlyUnlocked.forEach((a) => unlockedKeys.add(a.key));
    }

    return ok({
      simClaimedToday: claims.some((c) => c.type === "sim"),
      coinsClaimedToday: claims.some((c) => c.type === "coins"),
      streakDay: await currentStreak(user.id),
      xp: user.xp,
      level: user.level,
      achievements: ACHIEVEMENTS.map((a) => ({
        key: a.key,
        name: a.name,
        target: a.target,
        progress: Math.min(progress[a.key], a.target),
        unlocked: unlockedKeys.has(a.key),
      })),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
