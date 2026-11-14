// P2 Batch 2 (O29): jackpots. The pot is HOUSE-funded: every cash
// stake in the jackpot's game(s) grows the pot by contributionPct% of
// the stake — a REPORTING number, never taken from any payout (the
// settle hook runs after the payout is computed, inside the same
// transaction, and touches only the JackpotPot row). Coins never feed
// a jackpot (play-money only). Paying the pot credits the picked
// player as a bonus and resets the pot to the seed amount.
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { dec, round2 } from "./money";
import { getGame } from "./games";

export interface JackpotRow {
  id: string;
  name: string;
  gameSlug: string;
  gameName: string;
  seedAmount: number;
  contributionPct: number;
  currentPot: number;
  active: boolean;
  createdBy: string;
  createdAt: string;
}

export function jackpotGameName(gameSlug: string): string {
  if (gameSlug === "all") return "All games";
  return getGame(gameSlug)?.name ?? gameSlug;
}

export async function getJackpots(): Promise<JackpotRow[]> {
  const rows = await prisma.jackpot.findMany({
    orderBy: { createdAt: "desc" },
    include: { pot: true },
  });
  return rows.map((j) => ({
    id: j.id,
    name: j.name,
    gameSlug: j.gameSlug,
    gameName: jackpotGameName(j.gameSlug),
    seedAmount: dec(j.seedAmount),
    contributionPct: dec(j.contributionPct),
    // The pot row is the source of truth; currentPot mirrors it.
    currentPot: dec(j.pot?.pot ?? j.currentPot),
    active: j.active,
    createdBy: j.createdBy,
    createdAt: j.createdAt.toISOString(),
  }));
}

/**
 * Grow every active jackpot whose game matches this stake. Runs
 * INSIDE the settle transaction (tx), AFTER the payout is computed —
 * it never changes a payout, only the JackpotPot rows. Cash only.
 */
export async function contributeToJackpots(
  tx: Prisma.TransactionClient,
  gameSlug: string,
  currency: "cash" | "coins",
  stake: number,
): Promise<void> {
  if (currency !== "cash" || stake <= 0) return;
  const jackpots = await tx.jackpot.findMany({ where: { active: true }, select: { id: true, gameSlug: true, contributionPct: true } });
  if (jackpots.length === 0) return;
  for (const j of jackpots) {
    if (j.gameSlug !== "all" && j.gameSlug !== gameSlug) continue;
    const add = round2((stake * dec(j.contributionPct)) / 100);
    if (add <= 0) continue;
    // One row per jackpot — create on first contribution.
    const pot = await tx.jackpotPot.upsert({
      where: { jackpotId: j.id },
      update: { pot: { increment: add } },
      create: { jackpotId: j.id, pot: add },
    });
    await tx.jackpot.update({ where: { id: j.id }, data: { currentPot: dec(pot.pot) } });
  }
}
