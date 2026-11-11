import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getGame } from "./games";
import { dec, round2, toDecimal } from "./money";

/**
 * The single server-side settlement path. Every balance change for a game
 * goes through here, inside one Prisma transaction. The client NEVER sends
 * balances — only game, currency, stake and payout, all re-validated here.
 * Coins are integers and are never converted to cash.
 */
export async function settleGame(
  userId: string,
  gameSlug: string,
  currency: "cash" | "coins",
  stake: number,
  payout: number,
  result?: Record<string, unknown> | null,
) {
  const game = getGame(gameSlug);
  if (!game) throw new Error(`Unknown game: ${gameSlug}`);
  if (game.currency !== currency) {
    throw new Error(`${game.name} is a ${game.currency} game — settle in ${game.currency} only`);
  }
  if (!Number.isFinite(stake) || stake <= 0) throw new Error("Stake must be > 0");
  if (!Number.isFinite(payout) || payout < 0) throw new Error("Payout must be >= 0");
  if (payout > round2(stake * game.maxMultiplier) + 1e-9) {
    throw new Error(`Payout exceeds ${game.name} max multiplier ×${game.maxMultiplier}`);
  }
  if (currency === "coins" && (!Number.isInteger(stake) || !Number.isInteger(payout))) {
    throw new Error("Coin stakes and payouts must be whole coins");
  }

  const stakeD = currency === "cash" ? toDecimal(stake) : stake;
  const payoutD = currency === "cash" ? toDecimal(payout) : payout;

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) throw new Error("Account not found or inactive");
    if (currency === "cash") {
      if (dec(user.cashBalance) < stake) throw new Error("Insufficient cash balance");
    } else if (user.coins < stake) {
      throw new Error("Insufficient coins");
    }

    const updated =
      currency === "cash"
        ? await tx.user.update({
            where: { id: userId },
            data: {
              cashBalance: toDecimal(dec(user.cashBalance) - stake + payout),
              xp: { increment: 2 },
            },
          })
        : await tx.user.update({
            where: { id: userId },
            data: { coins: user.coins - stake + payout, xp: { increment: 2 } },
          });

    // Level = 1 + floor(xp / 100).
    const level = 1 + Math.floor(updated.xp / 100);
    const withLevel =
      level !== updated.level
        ? await tx.user.update({ where: { id: userId }, data: { level } })
        : updated;

    const gameResult = await tx.gameResult.create({
      data: {
        userId,
        game: gameSlug,
        currency,
        stake: currency === "cash" ? (stakeD as never) : stake,
        payout: currency === "cash" ? (payoutD as never) : payout,
        result: (result ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    return {
      gameResult,
      cash: dec(withLevel.cashBalance),
      coins: withLevel.coins,
      sim: dec(withLevel.simBalance),
      xp: withLevel.xp,
      level: withLevel.level,
    };
  });
}
