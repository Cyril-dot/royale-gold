// Win logic (Nov 2026, owner feature) — Stake + Winnings split and the
// per-deposit win allowance.
//
// THE MODEL (approved by Chuks, 18 Nov 2026):
// - Two balances: Stake (deposit money — what the user plays with) and
//   Winnings (money won in games). cashBalance stays the single
//   spendable total; Winnings is a sub-ledger of it (WinWallet table):
//   Stake = cashBalance - winnings, 0 <= winnings <= cashBalance.
// - Every deposit creates a win allowance = deposit x the owner-set
//   rate for that fiat (e.g. GH₵100 at 20% = GH₵20). Total game
//   winnings from that deposit, across ALL games, cannot exceed its
//   allowance. Allowance is a running balance per user per fiat
//   (WinAllowance table): topped up on each deposit, drained as
//   winnings are credited. Exhausted = wins credit nothing until the
//   next deposit tops it up.
// - The rate is per fiat, null (no row) = OFF = current behaviour, no
//   cap at all. Deposits made while the rate is OFF create no
//   allowance — the rate is stamped at deposit time, never retroactive
//   (same philosophy as commission pctInForce).
// - Cash only. Coins are play money, never withdrawable — untouched.
// - The LIVE win-chance factor (economy.ts) is UNCHANGED — the cap is
//   a hard limit ON TOP of it, not a replacement.
// - Manual credits (admin bonus, jackpot pay, cashback, promo match,
//   tournament / loyalty prizes) land in the Stake portion, never in
//   Winnings, and never drain the allowance — they are not game-round
//   winnings.
// - NO max-win labels anywhere player-facing: nothing in this file
//   produces a player-facing string. The cap is silent server-side.
//
// PROD SAFETY: the three tables do not exist in prod Neon until Chuks
// runs rg-win-logic.sql. Every read here catches the missing-table
// error (Prisma P2021/P2022) and degrades to OFF / zero — the site never
// 500s for tables it does not have yet. Only the owner write path
// fails, with a plain 503 telling the owner to run the SQL first.
// Reads use explicit `select` so a future column addition cannot 500
// them either (the 17 Nov owner-500s lesson, 3833bdf).
//
// All money functions take a Prisma transaction client (tx) where they
// run inside a money transaction (settle / deposit / convert / adjust)
// so the balance move, the allowance drain and the winnings credit are
// atomic. The global-prisma variants are for reads only.
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { dec, round2 } from "./money";

type Tx = Prisma.TransactionClient;

function isMissingTable(err: unknown): boolean {
  // Prisma P2021 = "the table does not exist", P2022 = "the column
  // does not exist" — BOTH mean "this database predates the feature".
  // The round-1 fixed-deposit guard checked P2022 only; the nodb A/B
  // proved a dropped TABLE throws P2021 on SQLite (and on Postgres),
  // so a P2022-only guard 500s exactly the case it exists to prevent.
  const code = (err as { code?: string }).code;
  return code === "P2021" || code === "P2022";
}

/** Rate bounds: a percent of the deposit, 0 < rate <= 100. */
export const WIN_RATE_MAX_PCT = 100;

/** The win rate (%) for one fiat, or null when OFF / table missing. */
export async function getWinRate(currency: string): Promise<number | null> {
  const code = (currency || "GHS").toUpperCase();
  try {
    const row = await prisma.winRate.findUnique({ where: { currency: code }, select: { ratePct: true } });
    if (!row) return null;
    const v = dec(row.ratePct);
    return v > 0 && v <= WIN_RATE_MAX_PCT ? round2(v) : null;
  } catch (err) {
    if (isMissingTable(err)) return null;
    throw err;
  }
}

/** Every win rate, keyed by fiat — P2021/P2022-safe (missing table → {}). */
export async function getAllWinRates(): Promise<Record<string, number>> {
  try {
    const rows = await prisma.winRate.findMany({ select: { currency: true, ratePct: true } });
    const out: Record<string, number> = {};
    for (const r of rows) {
      const v = dec(r.ratePct);
      if (v > 0 && v <= WIN_RATE_MAX_PCT) out[r.currency.toUpperCase()] = round2(v);
    }
    return out;
  } catch (err) {
    if (isMissingTable(err)) return {};
    throw err;
  }
}

/**
 * Owner set/clear. ratePct null = clear (delete the row = OFF).
 * Throws a plain Error with a 503 message when the table is missing
 * in prod — the route maps it to 503 so the owner knows to run the SQL.
 * Always audit-logs (action "win.rate").
 */
export async function setWinRate(
  actorId: string,
  currency: string,
  ratePct: number | null,
): Promise<number | null> {
  const code = (currency || "GHS").toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new Error("currency must be a 3-letter code (e.g. GHS, NGN)");
  let next: number | null = null;
  if (ratePct !== null) {
    if (typeof ratePct !== "number" || !Number.isFinite(ratePct) || ratePct <= 0 || ratePct > WIN_RATE_MAX_PCT) {
      throw new Error(`Win rate must be a percent above 0 and at most ${WIN_RATE_MAX_PCT}`);
    }
    next = round2(ratePct);
  }
  try {
    if (next === null) {
      await prisma.winRate.deleteMany({ where: { currency: code } });
    } else {
      await prisma.winRate.upsert({
        where: { currency: code },
        update: { ratePct: next },
        create: { currency: code, ratePct: next },
      });
    }
  } catch (err) {
    if (isMissingTable(err)) {
      throw new Error("Win rates are not set up yet — run rg-win-logic.sql in Neon first");
    }
    throw err;
  }
  await prisma.auditLog.create({
    data: {
      actorId,
      action: "win.rate",
      targetId: code,
      detail:
        next === null
          ? `Win rate for ${code} cleared — game winnings are uncapped again`
          : `Win rate for ${code} set to ${next}% — a ${code} deposit can win at most ${next}% of itself in total, across all games`,
    },
  });
  return next;
}

/**
 * Deposit top-up (call inside the deposit transaction, after the
 * DepositEvent is written): allowance += deposit x rate in force NOW.
 * Rate OFF or tables missing = no-op. Existing allowances are never
 * rewritten — a rate change only affects deposits made after it.
 */
export async function topUpAllowance(
  tx: Tx,
  userId: string,
  fiatCurrency: string,
  depositAmount: number,
): Promise<void> {
  const code = (fiatCurrency || "GHS").toUpperCase();
  const amount = round2(depositAmount);
  if (amount <= 0) return;
  try {
    const row = await tx.winRate.findUnique({ where: { currency: code }, select: { ratePct: true } });
    if (!row) return;
    const rate = dec(row.ratePct);
    if (!(rate > 0) || rate > WIN_RATE_MAX_PCT) return;
    const topUp = round2((amount * rate) / 100);
    if (topUp <= 0) return;
    const cur = await tx.winAllowance.findUnique({
      where: { userId_fiatCurrency: { userId, fiatCurrency: code } },
      select: { remaining: true },
    });
    const next = round2(dec(cur?.remaining) + topUp);
    await tx.winAllowance.upsert({
      where: { userId_fiatCurrency: { userId, fiatCurrency: code } },
      update: { remaining: next },
      create: { userId, fiatCurrency: code, remaining: next },
    });
  } catch (err) {
    if (isMissingTable(err)) return;
    throw err;
  }
}

/**
 * Credit a game profit (payout - stake, > 0) under the cap, inside the
 * settle transaction. Returns the profit actually credited:
 * - Rate OFF (or tables missing): the full profit — but it still lands
 *   in Winnings, so the split works with the cap off too.
 * - Rate ON: min(profit, remaining allowance); the allowance is
 *   drained by exactly the credited amount.
 * The credited profit is added to the WinWallet winnings sub-ledger.
 * Silent by design — no message, no label; the caller credits
 * stake + returned profit as the payout.
 */
export async function creditWinProfit(
  tx: Tx,
  userId: string,
  fiatCurrency: string,
  profit: number,
): Promise<number> {
  const code = (fiatCurrency || "GHS").toUpperCase();
  const p = round2(profit);
  if (p <= 0) return 0;
  try {
    const rateRow = await tx.winRate.findUnique({ where: { currency: code }, select: { ratePct: true } });
    const rate = rateRow ? dec(rateRow.ratePct) : 0;
    let credited = p;
    if (rate > 0 && rate <= WIN_RATE_MAX_PCT) {
      const allow = await tx.winAllowance.findUnique({
        where: { userId_fiatCurrency: { userId, fiatCurrency: code } },
        select: { remaining: true },
      });
      const remaining = round2(dec(allow?.remaining));
      credited = Math.min(p, Math.max(0, remaining));
      if (credited > 0) {
        await tx.winAllowance.update({
          where: { userId_fiatCurrency: { userId, fiatCurrency: code } },
          data: { remaining: round2(remaining - credited) },
        });
      }
    }
    if (credited > 0) {
      const cur = await tx.winWallet.findUnique({ where: { userId }, select: { winnings: true } });
      await tx.winWallet.upsert({
        where: { userId },
        update: { winnings: round2(dec(cur?.winnings) + credited) },
        create: { userId, fiatCurrency: code, winnings: credited },
      });
    }
    return round2(credited);
  } catch (err) {
    if (isMissingTable(err)) return p;
    throw err;
  }
}

/**
 * Winnings sub-ledger for one user (P2021/P2022-safe → 0). The caller owns
 * cashBalance; Stake = cash - winnings.
 */
export async function getWinnings(userId: string): Promise<number> {
  try {
    const row = await prisma.winWallet.findUnique({ where: { userId }, select: { winnings: true } });
    return round2(Math.max(0, dec(row?.winnings)));
  } catch (err) {
    if (isMissingTable(err)) return 0;
    throw err;
  }
}

/**
 * Same read inside a transaction (e.g. settleGame's return split).
 * Catching P2021/P2022 inside the transaction callback is safe — the
 * transaction only rolls back if the callback itself throws.
 */
export async function getWinningsTx(tx: Tx, userId: string): Promise<number> {
  try {
    const row = await tx.winWallet.findUnique({ where: { userId }, select: { winnings: true } });
    return round2(Math.max(0, dec(row?.winnings)));
  } catch (err) {
    if (isMissingTable(err)) return 0;
    throw err;
  }
}

/** The Stake/Winnings split for a known cash balance. */
export function splitCash(cash: number, winnings: number): { cash: number; winnings: number; stake: number } {
  const c = round2(Math.max(0, cash));
  const w = round2(Math.min(Math.max(0, winnings), c));
  return { cash: c, winnings: w, stake: round2(c - w) };
}

/**
 * Clamp after a cash debit (settle loss, convert, admin adjust):
 * winnings can never exceed the cash left — debits hit Stake first,
 * Winnings only when the total drops below it. No-op when the tables
 * are missing or the invariant already holds.
 */
export async function clampWinnings(tx: Tx, userId: string, cashBalance: number): Promise<void> {
  const cash = round2(Math.max(0, cashBalance));
  try {
    const row = await tx.winWallet.findUnique({ where: { userId }, select: { winnings: true } });
    if (!row) return;
    const w = dec(row.winnings);
    if (w > cash) {
      await tx.winWallet.update({ where: { userId }, data: { winnings: cash } });
    }
  } catch (err) {
    if (isMissingTable(err)) return;
    throw err;
  }
}
