import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { dec, round2, todayStr, toDecimal } from "@/lib/money";
import { currentStreak } from "@/lib/rewards";

/**
 * Daily claim, once per day per type.
 *  - sim:   +100 SIM credits to the separate SIM/demo balance (GH₵100).
 *  - coins: +5 coins.
 * Also awards +10 XP. Streak counts consecutive claim days.
 */
export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await readJson<{ type?: string }>(req);
    const type = body?.type;
    if (type !== "sim" && type !== "coins") return fail("type must be 'sim' or 'coins'");
    const claimedDate = todayStr();

    const priorStreak = await currentStreak(user.id);
    const claimedToday = await prisma.dailyClaim.findFirst({
      where: { userId: user.id, claimedDate },
      select: { type: true },
    });
    const alreadyClaimedThisType = await prisma.dailyClaim.findUnique({
      where: { userId_type_claimedDate: { userId: user.id, type, claimedDate } },
    });
    if (alreadyClaimedThisType) return fail(`Daily ${type} bonus already claimed`, 409);

    const alreadyClaimedToday = claimedToday !== null;
    // Same-day second claim keeps the streak; a new day extends it by 1.
    const newStreakDay = alreadyClaimedToday ? priorStreak : priorStreak + 1;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.dailyClaim.create({
        data: { userId: user.id, type, claimedDate, streakDay: newStreakDay },
      });
      const data =
        type === "sim"
          ? { simBalance: toDecimal(dec(user.simBalance) + 100), xp: { increment: 10 } }
          : { coins: { increment: 5 }, xp: { increment: 10 } };
      const u = await tx.user.update({ where: { id: user.id }, data });
      const level = 1 + Math.floor(u.xp / 100);
      return level !== u.level
        ? tx.user.update({ where: { id: user.id }, data: { level } })
        : u;
    });

    return ok({
      type,
      streakDay: newStreakDay,
      claimedBothToday: Boolean(claimedToday),
      cash: dec(updated.cashBalance),
      coins: updated.coins,
      sim: round2(dec(updated.simBalance)),
      xp: updated.xp,
      level: updated.level,
    }, 201);
  } catch (err) {
    // Unique-constraint race: two claims in the same second.
    if (err instanceof Error && /Unique constraint/.test(err.message)) {
      return fail("Daily bonus already claimed", 409);
    }
    return toErrorResponse(err);
  }
}
