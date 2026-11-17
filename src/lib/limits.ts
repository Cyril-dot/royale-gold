import { prisma } from "./prisma";
import { dec, round2, todayStr } from "./money";
import { symbolFor } from "./country";

// P1 Batch 1 (A20): per-player limits, set by an admin (own downline
// only). Enforced server-side in settleGame (max stake, daily loss,
// cool-off), the play route (same, before the draw) and the deposit
// route (daily deposit max). Null = no limit on that field.
//
// Phase 1 country-based (Nov 2026): limit values are stored in the
// PLAYER'S fiat (one fiat per user, set at register) — the sums below
// filter by that fiat, and every message prints the player's symbol,
// never a hardcoded GH₵. Units are CASH only for stake/loss — coin
// stakes are play-money and the per-game coin caps (Batch 2 O10) still
// apply. A cool-off blocks BOTH wallets: it is a break from play, not
// a money rule. The daily loss is the day's REALISED cash loss (stakes −
// payouts on cash games today, UTC); a bet is rejected when it could
// push the day past the max (loss so far + this stake > max).

export interface PlayerLimitRow {
  maxStake: number | null;
  maxDepositPerDay: number | null;
  maxLossPerDay: number | null;
  coolOffUntil: string | null;
  // P2 Batch 1 (A29): self-exclusion (a hard stop — no deposit, play
  // or settle until the date) + the reality-check interval in minutes
  // (0 = off).
  selfExcludedUntil: string | null;
  selfExclusionReason: string | null;
  realityCheckMinutes: number;
}

export async function getPlayerLimit(userId: string): Promise<PlayerLimitRow | null> {
  const row = await prisma.playerLimit.findUnique({ where: { userId } });
  if (!row) return null;
  return {
    maxStake: row.maxStake == null ? null : dec(row.maxStake),
    maxDepositPerDay: row.maxDepositPerDay == null ? null : dec(row.maxDepositPerDay),
    maxLossPerDay: row.maxLossPerDay == null ? null : dec(row.maxLossPerDay),
    coolOffUntil: row.coolOffUntil?.toISOString() ?? null,
    selfExcludedUntil: row.selfExcludedUntil?.toISOString() ?? null,
    selfExclusionReason: row.selfExclusionReason ?? null,
    realityCheckMinutes: row.realityCheckMinutes ?? 0,
  };
}

/** Today's realised cash loss for a player (stakes − payouts, cash games, UTC day, in the player's fiat). */
export async function todayCashLoss(userId: string, fiatCurrency: string = "GHS"): Promise<number> {
  const day = todayStr();
  const from = new Date(day + "T00:00:00Z");
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  const rows = await prisma.gameResult.findMany({
    where: { userId, currency: "cash", fiatCurrency, createdAt: { gte: from, lt: to } },
    select: { stake: true, payout: true },
  });
  return round2(rows.reduce((s, r) => s + dec(r.stake) - dec(r.payout), 0));
}

/** Today's deposited total (cash, in the player's fiat) for a player. */
export async function todayDeposited(userId: string, fiatCurrency: string = "GHS"): Promise<number> {
  const day = todayStr();
  const from = new Date(day + "T00:00:00Z");
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  const rows = await prisma.depositEvent.findMany({
    where: { userId, fiatCurrency, createdAt: { gte: from, lt: to } },
    select: { amount: true },
  });
  return round2(rows.reduce((s, r) => s + dec(r.amount), 0));
}

/**
 * The play check, shared by settleGame and the play route (before the
 * draw). Returns a plain error message when this player may not bet, or
 * null when they may.
 */
export async function checkPlayLimits(userId: string, stake: number, currency: "cash" | "coins", fiatCurrency: string = "GHS"): Promise<string | null> {
  const limit = await getPlayerLimit(userId);
  if (!limit) return null;
  const sym = symbolFor(fiatCurrency);
  // P2 Batch 1 (A29): self-exclusion is a hard stop — it is checked
  // FIRST, before the cool-off, so a self-excluded player can never
  // bet even if the cool-off has expired.
  if (limit.selfExcludedUntil && new Date(limit.selfExcludedUntil).getTime() > Date.now()) {
    return `This account is self-excluded until ${new Date(limit.selfExcludedUntil).toLocaleDateString("en-GB")} — play is suspended`;
  }
  if (limit.coolOffUntil && new Date(limit.coolOffUntil).getTime() > Date.now()) {
    return `This account is on a cool-off until ${new Date(limit.coolOffUntil).toLocaleDateString("en-GB")} — play is suspended`;
  }
  if (currency === "cash") {
    if (limit.maxStake != null && stake > limit.maxStake) {
      return `Your max stake per bet is ${sym} ${limit.maxStake.toFixed(2)}`;
    }
    if (limit.maxLossPerDay != null) {
      const loss = await todayCashLoss(userId, fiatCurrency);
      if (loss + stake > limit.maxLossPerDay) {
        return `Your daily loss limit of ${sym} ${limit.maxLossPerDay.toFixed(2)} is reached — no more play today`;
      }
    }
  }
  return null;
}

/** The deposit check for the deposit route. Null = allowed. */
export async function checkDepositLimit(userId: string, amount: number, fiatCurrency: string = "GHS"): Promise<string | null> {
  const limit = await getPlayerLimit(userId);
  if (!limit) return null;
  const sym = symbolFor(fiatCurrency);
  // P2 Batch 1 (A29): self-exclusion blocks deposits too (a cool-off
  // does not — it is a break from play, and the daily deposit max is
  // the deposit-side rule for it).
  if (limit.selfExcludedUntil && new Date(limit.selfExcludedUntil).getTime() > Date.now()) {
    return `This account is self-excluded until ${new Date(limit.selfExcludedUntil).toLocaleDateString("en-GB")} — deposits are suspended`;
  }
  if (limit.maxDepositPerDay == null) return null;
  const today = await todayDeposited(userId, fiatCurrency);
  if (today + amount > limit.maxDepositPerDay) {
    return `Your daily deposit limit is ${sym} ${limit.maxDepositPerDay.toFixed(2)} (${sym} ${today.toFixed(2)} deposited today)`;
  }
  return null;
}
