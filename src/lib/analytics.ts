// Owner analytics (Nov 2026): income vs losses + when income rises.
// All figures come from the real tables, per fiat, UTC days
// (docs/FINANCIAL_METRIC_DEFINITIONS.md):
//   deposits in  = SUM(DepositEvent.amount) — every DepositEvent row
//                  is a successful deposit.
//   payouts out  = approved withdrawals (Withdrawal.status =
//                  "approved", day = the request's createdAt UTC day)
//                  + game payouts (GameResult.payout, currency "cash").
//   net position = deposits in − payouts out. Labelled exactly that —
//                  NEVER "profit" (deposits − payouts is cash flow,
//                  not profit; net profit lives on the P&L page).
//   GGR (cash)   = cash stakes − cash payouts (GameResult).
// Per-game figures reuse revenueBreakdown (src/lib/revenue.ts) — the
// same breakdown the BI page shows — so the two pages can never
// disagree on a game's stakes/payouts/GGR. No new tables, no stored
// state, no forecasting.
import { prisma } from "./prisma";
import { dec, round2, dateStr } from "./money";
import { revenueBreakdown, type RevenueGameRow } from "./revenue";

export interface AnalyticsDayRow {
  date: string;
  deposits: number;
  depositsCount: number;
  payoutsOut: number;
  net: number;
  ggr: number;
}

export interface AnalyticsHourRow {
  hour: number; // 0–23 UTC
  deposits: number;
  count: number;
}

export interface AnalyticsTrend {
  /** % change in deposits vs the previous period (null when the
   *  previous period had no deposits and this one does — "new"). */
  depositsPct: number | null;
  payoutsPct: number | null;
  direction: "rising" | "falling" | "flat";
}

export interface AnalyticsData {
  from: string;
  to: string;
  fiatCurrency: string;
  totals: {
    deposits: number;
    depositsCount: number;
    paidOut: number;
    paidOutCount: number;
    gamePayouts: number;
    ggrCash: number;
    netPosition: number;
  };
  daily: AnalyticsDayRow[];
  hourly: AnalyticsHourRow[];
  bestDay: { date: string; deposits: number } | null;
  trend: AnalyticsTrend;
  byGameCash: RevenueGameRow[];
  byGameCoins: RevenueGameRow[];
}

function dayBounds(from: string, to: string): { from: Date; to: Date } {
  return { from: new Date(`${from}T00:00:00Z`), to: new Date(`${to}T23:59:59.999Z`) };
}

function addDaysStr(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function spanDays(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000) + 1;
}

export async function getAnalytics(from: string, to: string, fiatCurrency: string = "GHS"): Promise<AnalyticsData> {
  const fiat = fiatCurrency.toUpperCase();
  const { from: fromDate, to: toDate } = dayBounds(from, to);
  const range = { createdAt: { gte: fromDate, lte: toDate } };

  // Per-game + daily deposits/GGR from the shared breakdown (same
  // figures as the BI page — never recomputed here).
  const breakdown = await revenueBreakdown(from, to, fiat);

  const [approvedWithdrawals, cashRounds, deposits] = await Promise.all([
    prisma.withdrawal.findMany({
      where: { ...range, status: "approved", fiatCurrency: fiat },
      select: { amount: true, createdAt: true },
    }),
    prisma.gameResult.findMany({
      where: { ...range, currency: "cash", fiatCurrency: fiat },
      select: { payout: true, createdAt: true },
    }),
    prisma.depositEvent.findMany({
      where: { ...range, fiatCurrency: fiat },
      select: { amount: true, createdAt: true },
    }),
  ]);

  // Bucket approved withdrawals + game payouts by UTC day.
  const wdByDay = new Map<string, number>();
  for (const w of approvedWithdrawals) {
    const d = dateStr(new Date(w.createdAt));
    wdByDay.set(d, round2((wdByDay.get(d) ?? 0) + dec(w.amount)));
  }
  const gpByDay = new Map<string, number>();
  for (const r of cashRounds) {
    const d = dateStr(new Date(r.createdAt));
    gpByDay.set(d, round2((gpByDay.get(d) ?? 0) + dec(r.payout)));
  }

  // Daily series — one row per day in range, zeros included (same day
  // list as the breakdown's byDay, so the chart never skips a day).
  const daily: AnalyticsDayRow[] = breakdown.byDay.map((b) => {
    const payoutsOut = round2((wdByDay.get(b.date) ?? 0) + (gpByDay.get(b.date) ?? 0));
    return {
      date: b.date,
      deposits: b.totalDeposited,
      depositsCount: b.deposits,
      payoutsOut,
      net: round2(b.totalDeposited - payoutsOut),
      ggr: b.ggr,
    };
  });

  // Hour-of-day deposits (UTC hour of DepositEvent.createdAt).
  const hourly: AnalyticsHourRow[] = Array.from({ length: 24 }, (_, hour) => ({ hour, deposits: 0, count: 0 }));
  for (const d of deposits) {
    const h = new Date(d.createdAt).getUTCHours();
    hourly[h].deposits = round2(hourly[h].deposits + dec(d.amount));
    hourly[h].count += 1;
  }

  // Totals.
  const depositsTotal = round2(daily.reduce((s, d) => s + d.deposits, 0));
  const depositsCount = daily.reduce((s, d) => s + d.depositsCount, 0);
  const paidOut = round2([...wdByDay.values()].reduce((s, v) => s + v, 0));
  const gamePayouts = round2([...gpByDay.values()].reduce((s, v) => s + v, 0));
  const payoutsOutTotal = round2(paidOut + gamePayouts);
  const netPosition = round2(depositsTotal - payoutsOutTotal);

  // Best day = the highest-deposit day in range.
  let bestDay: AnalyticsData["bestDay"] = null;
  for (const d of daily) {
    if (bestDay === null || d.deposits > bestDay.deposits) bestDay = { date: d.date, deposits: d.deposits };
  }
  if (bestDay !== null && bestDay.deposits === 0) bestDay = null;

  // Trend vs the previous period of the same length, immediately
  // before `from` (deposits + payouts out).
  const len = spanDays(from, to);
  const prevFrom = addDaysStr(from, -len);
  const prevTo = addDaysStr(from, -1);
  const prev = dayBounds(prevFrom, prevTo);
  const prevRange = { createdAt: { gte: prev.from, lte: prev.to } };
  const [prevDeposits, prevWithdrawals, prevRounds] = await Promise.all([
    prisma.depositEvent.aggregate({
      where: { ...prevRange, fiatCurrency: fiat },
      _sum: { amount: true },
    }),
    prisma.withdrawal.aggregate({
      where: { ...prevRange, status: "approved", fiatCurrency: fiat },
      _sum: { amount: true },
    }),
    prisma.gameResult.aggregate({
      where: { ...prevRange, currency: "cash", fiatCurrency: fiat },
      _sum: { payout: true },
    }),
  ]);
  const prevDepTotal = dec(prevDeposits._sum.amount);
  const prevPayTotal = round2(dec(prevWithdrawals._sum.amount) + dec(prevRounds._sum.payout));
  const pctChange = (cur: number, prevV: number): number | null => {
    if (prevV === 0) return cur === 0 ? 0 : null;
    return round2(((cur - prevV) / prevV) * 100);
  };
  const depositsPct = pctChange(depositsTotal, prevDepTotal);
  const payoutsPct = pctChange(payoutsOutTotal, prevPayTotal);
  const direction: AnalyticsTrend["direction"] =
    depositsPct === null ? (depositsTotal > 0 ? "rising" : "flat") : depositsPct > 0 ? "rising" : depositsPct < 0 ? "falling" : "flat";

  return {
    from,
    to,
    fiatCurrency: fiat,
    totals: {
      deposits: depositsTotal,
      depositsCount,
      paidOut,
      paidOutCount: approvedWithdrawals.length,
      gamePayouts,
      ggrCash: breakdown.totals.ggrCash,
      netPosition,
    },
    daily,
    hourly,
    bestDay,
    trend: { depositsPct, payoutsPct, direction },
    byGameCash: breakdown.byGameCash,
    byGameCoins: breakdown.byGameCoins,
  };
}
