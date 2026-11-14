// P1 Batch 3 (O16): owner revenue breakdowns — by game, by admin, by
// day, by payment method. Every figure comes from the real tables
// (GameResult, DepositEvent, CommissionPayout, the commission rules
// engine) — nothing is invented. The existing P&L endpoint
// (/api/owner/pnl) is untouched; this extends it with breakdowns.
//
// GGR (cash) = cash stakes − cash payouts. Coin games are shown apart
// (their GGR is in coins, not GH₵ — the two are never added together).
// Commission is recomputed by the rules engine (src/lib/commission.ts),
// the same figure the Commission page and the P&L show, so the numbers
// cannot disagree — except the known Batch 3 caveat: a rule created
// mid-day after a deposit was already stamped makes the per-day tab
// and the rollup disagree for that day (stamped legacy vs rules
// engine). The breakdowns here use the rules engine throughout.
import { prisma } from "./prisma";
import { dec, round2, dateStr } from "./money";
import { getGame } from "./games";
import { commissionOwed, dayCommissions, referredUserIds } from "./commission";

export interface RevenueGameRow {
  game: string;
  name: string;
  currency: string;
  rounds: number;
  stakes: number;
  payouts: number;
  ggr: number;
}

export interface RevenueAdminRow {
  adminId: string | null;
  adminName: string;
  deposits: number;
  totalDeposited: number;
  commission: number;
  ggr: number;
}

export interface RevenueDayRow {
  date: string;
  ggr: number;
  deposits: number;
  totalDeposited: number;
  commission: number;
}

export interface RevenueMethodRow {
  method: string;
  deposits: number;
  total: number;
}

export interface RevenueBreakdown {
  from: string;
  to: string;
  byGameCash: RevenueGameRow[];
  byGameCoins: RevenueGameRow[];
  byAdmin: RevenueAdminRow[];
  byDay: RevenueDayRow[];
  byMethod: RevenueMethodRow[];
  totals: { ggrCash: number; ggrCoins: number; deposits: number; totalDeposited: number; commission: number };
}

/** ?from=&to= range (UTC dates). Default: this month through today. */
export function parseOwnerRange(sp: URLSearchParams): { from: string; to: string } {
  const isDate = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const today = new Date().toISOString().slice(0, 10);
  const from = isDate(sp.get("from")) ? (sp.get("from") as string) : `${today.slice(0, 8)}01`;
  const to = isDate(sp.get("to")) ? (sp.get("to") as string) : today;
  return { from: from <= to ? from : to, to: from <= to ? to : from };
}

function dayBounds(from: string, to: string): { from: Date; to: Date } {
  return { from: new Date(`${from}T00:00:00Z`), to: new Date(`${to}T23:59:59.999Z`) };
}

export async function revenueBreakdown(from: string, to: string): Promise<RevenueBreakdown> {
  const { from: fromDate, to: toDate } = dayBounds(from, to);
  const range = { createdAt: { gte: fromDate, lte: toDate } };

  const [gameGroups, deposits, cashRounds, admins] = await Promise.all([
    prisma.gameResult.groupBy({
      by: ["game", "currency"],
      where: range,
      _sum: { stake: true, payout: true },
      _count: true,
    }),
    prisma.depositEvent.findMany({
      where: range,
      select: { amount: true, method: true, adminId: true, userId: true, createdAt: true },
    }),
    prisma.gameResult.findMany({
      where: { ...range, currency: "cash" },
      select: { userId: true, stake: true, payout: true, createdAt: true },
    }),
    prisma.user.findMany({ where: { role: "admin" }, select: { id: true, name: true } }),
  ]);

  // By game — cash and coins apart, each sorted by GGR desc.
  const gameRows: RevenueGameRow[] = gameGroups.map((g) => {
    const stakes = dec(g._sum.stake);
    const payouts = dec(g._sum.payout);
    return {
      game: g.game,
      name: getGame(g.game)?.name ?? g.game,
      currency: g.currency,
      rounds: g._count,
      stakes: round2(stakes),
      payouts: round2(payouts),
      ggr: g.currency === "coins" ? Math.round(stakes - payouts) : round2(stakes - payouts),
    };
  });
  const byGameCash = gameRows.filter((r) => r.currency === "cash").sort((a, b) => b.ggr - a.ggr);
  const byGameCoins = gameRows.filter((r) => r.currency === "coins").sort((a, b) => b.ggr - a.ggr);

  // By admin — deposits + commission + GGR for that admin's downline,
  // plus the unreferred slice (players with no referring admin).
  const ggrByUser = new Map<string, number>();
  for (const r of cashRounds) {
    ggrByUser.set(r.userId, round2((ggrByUser.get(r.userId) ?? 0) + dec(r.stake) - dec(r.payout)));
  }
  const unreferred = await prisma.user.findMany({
    where: { referredByAdminId: null, role: "user" },
    select: { id: true },
  });
  const unreferredIds = new Set(unreferred.map((u) => u.id));
  const byAdmin: RevenueAdminRow[] = [];
  for (const a of admins) {
    const ids = await referredUserIds(a.id);
    const deps = deposits.filter((d) => d.adminId === a.id);
    const ggr = round2(ids.reduce((s, id) => s + (ggrByUser.get(id) ?? 0), 0));
    byAdmin.push({
      adminId: a.id,
      adminName: a.name,
      deposits: deps.length,
      totalDeposited: round2(deps.reduce((s, d) => s + dec(d.amount), 0)),
      commission: await commissionOwed(a.id, from, to),
      ggr,
    });
  }
  const unrefDeps = deposits.filter((d) => d.adminId === null);
  byAdmin.push({
    adminId: null,
    adminName: "No referring admin",
    deposits: unrefDeps.length,
    totalDeposited: round2(unrefDeps.reduce((s, d) => s + dec(d.amount), 0)),
    commission: 0,
    ggr: round2([...unreferredIds].reduce((s, id) => s + (ggrByUser.get(id) ?? 0), 0)),
  });
  byAdmin.sort((a, b) => b.totalDeposited - a.totalDeposited);

  // By day — one row per day in the range, even with no activity.
  const byDay: RevenueDayRow[] = [];
  const dayGgr = new Map<string, number>();
  const dayDeps = new Map<string, { n: number; total: number }>();
  for (const r of cashRounds) {
    const d = dateStr(new Date(r.createdAt));
    dayGgr.set(d, round2((dayGgr.get(d) ?? 0) + dec(r.stake) - dec(r.payout)));
  }
  for (const d of deposits) {
    const key = dateStr(new Date(d.createdAt));
    const row = dayDeps.get(key) ?? { n: 0, total: 0 };
    row.n += 1;
    row.total = round2(row.total + dec(d.amount));
    dayDeps.set(key, row);
  }
  // Commission per day, from the rules engine (one dayCommissions call
  // per admin covers the whole range).
  const dayCommission = new Map<string, number>();
  for (const a of admins) {
    for (const d of await dayCommissions(a.id, from, to)) {
      dayCommission.set(d.date, round2((dayCommission.get(d.date) ?? 0) + d.totalCommission));
    }
  }
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    const key = dateStr(cursor);
    const dep = dayDeps.get(key) ?? { n: 0, total: 0 };
    byDay.push({
      date: key,
      ggr: dayGgr.get(key) ?? 0,
      deposits: dep.n,
      totalDeposited: dep.total,
      commission: dayCommission.get(key) ?? 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // By payment method.
  const methodMap = new Map<string, { n: number; total: number }>();
  for (const d of deposits) {
    const row = methodMap.get(d.method) ?? { n: 0, total: 0 };
    row.n += 1;
    row.total = round2(row.total + dec(d.amount));
    methodMap.set(d.method, row);
  }
  const byMethod: RevenueMethodRow[] = [...methodMap.entries()]
    .map(([method, v]) => ({ method, deposits: v.n, total: v.total }))
    .sort((a, b) => b.total - a.total);

  const ggrCash = round2(byGameCash.reduce((s, r) => s + r.ggr, 0));
  const ggrCoins = byGameCoins.reduce((s, r) => s + r.ggr, 0);
  return {
    from,
    to,
    byGameCash,
    byGameCoins,
    byAdmin,
    byDay,
    byMethod,
    totals: {
      ggrCash,
      ggrCoins,
      deposits: deposits.length,
      totalDeposited: round2(deposits.reduce((s, d) => s + dec(d.amount), 0)),
      commission: round2(byAdmin.reduce((s, r) => s + r.commission, 0)),
    },
  };
}
