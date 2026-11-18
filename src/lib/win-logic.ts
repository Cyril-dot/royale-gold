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
// - RANDOM WIN EXCEPTION (Nov 2026, win controls): the owner can set
//   a per-fiat exception chance (WinException table). On a cash win,
//   that percent of wins bypass the cap entirely — the full natural
//   profit is credited and the allowance is NOT drained for that win.
//   The roll is server-side only (Node crypto, inside the settle
//   transaction, so the exception and the credit are atomic) and the
//   client can never influence it. No row / 0% = OFF = the cap always
//   applies. Silent like the cap: no label, no announcement.
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
import { randomInt } from "crypto";
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

/** Exception-chance bounds: a percent of wins, 0 < chance <= 100. */
export const WIN_EXCEPTION_MAX_PCT = 100;

/** The random win exception chance (%) for one fiat, or null when OFF / table missing. */
export async function getWinExceptionChance(currency: string): Promise<number | null> {
  const code = (currency || "GHS").toUpperCase();
  try {
    const row = await prisma.winException.findUnique({ where: { currency: code }, select: { chancePct: true } });
    if (!row) return null;
    const v = dec(row.chancePct);
    return v > 0 && v <= WIN_EXCEPTION_MAX_PCT ? round2(v) : null;
  } catch (err) {
    if (isMissingTable(err)) return null;
    throw err;
  }
}

/** Every exception chance, keyed by fiat — P2021/P2022-safe (missing table → {}). */
export async function getAllWinExceptionChances(): Promise<Record<string, number>> {
  try {
    const rows = await prisma.winException.findMany({ select: { currency: true, chancePct: true } });
    const out: Record<string, number> = {};
    for (const r of rows) {
      const v = dec(r.chancePct);
      if (v > 0 && v <= WIN_EXCEPTION_MAX_PCT) out[r.currency.toUpperCase()] = round2(v);
    }
    return out;
  } catch (err) {
    if (isMissingTable(err)) return {};
    throw err;
  }
}

/**
 * Owner set/clear. chancePct null = clear (delete the row = OFF).
 * Throws a plain Error with a 503 message when the table is missing
 * in prod — the route maps it to 503 so the owner knows to run the SQL.
 * Always audit-logs (action "win.exception").
 */
export async function setWinExceptionChance(
  actorId: string,
  currency: string,
  chancePct: number | null,
): Promise<number | null> {
  const code = (currency || "GHS").toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new Error("currency must be a 3-letter code (e.g. GHS, NGN)");
  let next: number | null = null;
  if (chancePct !== null) {
    if (typeof chancePct !== "number" || !Number.isFinite(chancePct) || chancePct <= 0 || chancePct > WIN_EXCEPTION_MAX_PCT) {
      throw new Error(`Win exception chance must be a percent above 0 and at most ${WIN_EXCEPTION_MAX_PCT}`);
    }
    next = round2(chancePct);
  }
  try {
    if (next === null) {
      await prisma.winException.deleteMany({ where: { currency: code } });
    } else {
      await prisma.winException.upsert({
        where: { currency: code },
        update: { chancePct: next },
        create: { currency: code, chancePct: next },
      });
    }
  } catch (err) {
    if (isMissingTable(err)) {
      throw new Error("Win exception chances are not set up yet — run rg-win-controls.sql in Neon first");
    }
    throw err;
  }
  await prisma.auditLog.create({
    data: {
      actorId,
      action: "win.exception",
      targetId: code,
      detail:
        next === null
          ? `Win exception chance for ${code} cleared — the win cap always applies again`
          : `Win exception chance for ${code} set to ${next}% — about ${next} in 100 cash wins bypass the win cap entirely`,
    },
  });
  return next;
}

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
 * settle transaction. Returns the profit actually credited and whether
 * the random win exception fired:
 * - Rate OFF (or tables missing): the full profit — but it still lands
 *   in Winnings, so the split works with the cap off too.
 * - Rate ON: min(profit, remaining allowance); the allowance is
 *   drained by exactly the credited amount.
 * - Rate ON + exception roll hits: the FULL profit, allowance
 *   untouched for this win (exception: true).
 * The credited profit is added to the WinWallet winnings sub-ledger.
 * Silent by design — no message, no label; the caller credits
 * stake + returned profit as the payout. The exception roll is
 * server-side only (Node crypto, inside this transaction, so the
 * exception and the credit are atomic); the client can never
 * influence it. The WinException read is wrapped on its own: a prod
 * DB with the rate tables but WITHOUT WinException yet (the
 * rg-win-controls.sql gap) degrades to "no exception" — the cap
 * applies normally — instead of the outer catch returning the full
 * profit for every win.
 */
export async function creditWinProfit(
  tx: Tx,
  userId: string,
  fiatCurrency: string,
  profit: number,
): Promise<{ credited: number; exception: boolean }> {
  const code = (fiatCurrency || "GHS").toUpperCase();
  const p = round2(profit);
  if (p <= 0) return { credited: 0, exception: false };
  try {
    const rateRow = await tx.winRate.findUnique({ where: { currency: code }, select: { ratePct: true } });
    const rate = rateRow ? dec(rateRow.ratePct) : 0;
    let credited = p;
    let exception = false;
    if (rate > 0 && rate <= WIN_RATE_MAX_PCT) {
      let chance = 0;
      try {
        const excRow = await tx.winException.findUnique({ where: { currency: code }, select: { chancePct: true } });
        const v = excRow ? dec(excRow.chancePct) : 0;
        chance = v > 0 && v <= WIN_EXCEPTION_MAX_PCT ? v : 0;
      } catch (err) {
        if (!isMissingTable(err)) throw err;
      }
      // chancePct is stored to 2dp, so chance * 100 is an integer
      // 0..10000 and randomInt(0, 10000) < threshold is exact:
      // 5% -> 500/10000, 5.25% -> 525/10000, 100% -> always.
      if (chance > 0 && randomInt(0, 10000) < Math.round(chance * 100)) {
        exception = true;
      }
      if (!exception) {
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
    }
    if (credited > 0) {
      const cur = await tx.winWallet.findUnique({ where: { userId }, select: { winnings: true } });
      await tx.winWallet.upsert({
        where: { userId },
        update: { winnings: round2(dec(cur?.winnings) + credited) },
        create: { userId, fiatCurrency: code, winnings: credited },
      });
    }
    return { credited: round2(credited), exception };
  } catch (err) {
    if (isMissingTable(err)) return { credited: p, exception: false };
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
