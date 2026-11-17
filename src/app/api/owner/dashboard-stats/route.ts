// Owner Overview dashboard stats (Nov 2026) — one call, all figures,
// in ONE fiat (?currency=, default GHS). Definitions, all from the real
// tables — nothing is invented:
//   usersTotal / usersToday  = players (role "user") in that fiat;
//                             today = registered in the UTC day.
//   depositedTotal / Today  = sum of DepositEvent.amount (ALL deposits,
//                             not only referred ones — the old Overall
//                             totals counted referred deposits only).
//   paidOutTotal / Today    = sum of Withdrawal.amount where status =
//                             "approved" — the panel has no "paid"
//                             status; approved is the final state and
//                             the same definition the P&L uses. Day =
//                             the request's createdAt day (UTC), as the
//                             P&L does — not the approval day.
//   commissionToday         = today's commission owed to all admins,
//                             recomputed by the rules engine (+ legacy
//                             fallback) — the same calculation the
//                             per-day Commission viewer uses.
// Day = UTC calendar day, the same day logic as todayStr() / the
// Commission per-day viewer.
//
// PRIME Phase 1 (Nov 2026) — global date range (?from=&to=, YYYY-MM-DD
// inclusive, UTC). The range drives the date-sensitive figures:
//   usersRange / depositedRange / paidOutRange / commissionRange = the
//   same figures over [from, to] instead of today; the matching *Prev
//   fields are the previous equivalent period (same length, immediately
//   before `from`). finChart = toggleable series (deposits, approved
//   payouts, commission generated, commission paid) bucketed daily
//   (<=31 days), weekly (<=92), monthly (longer); growthChart = new
//   users + cumulative users per bucket. Commission per day comes from
//   dayCommissions — the same canonical recompute totalCommissionOwed
//   uses, never a re-derivation. No schema change.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dateStr, dec, round2, todayStr } from "@/lib/money";
import { ok, toErrorResponse } from "@/lib/http";
import { commissionPaid, commissionSummary, dayCommissions, totalCommissionOwed } from "@/lib/commission";

const DAY = 24 * 60 * 60 * 1000;
const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const addDays = (date: string, n: number): string => {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return dateStr(d);
};
const dayStart = (date: string): Date => new Date(`${date}T00:00:00.000Z`);
const dayEnd = (date: string): Date => new Date(dayStart(date).getTime() + DAY);

/** Commission generated per UTC day over [from, to] (inclusive), summed
 *  across all admins — the same dayCommissions recompute that
 *  totalCommissionOwed sums, so the two can never disagree. */
async function commByDay(from: string, to: string, fiatCurrency: string): Promise<Map<string, number>> {
  const admins = await prisma.user.findMany({ where: { role: "admin" }, select: { id: true } });
  const byDay = new Map<string, number>();
  for (const a of admins) {
    const days = await dayCommissions(a.id, from, to, fiatCurrency);
    for (const d of days) byDay.set(d.date, round2((byDay.get(d.date) ?? 0) + d.totalCommission));
  }
  return byDay;
}

type Bucket = { label: string; from: string; to: string };

/** Bucket boundaries for a range: daily (<=31d), weekly (<=92d),
 *  monthly (longer). Labels stay short enough for the 44px bar label. */
function bucketsFor(from: string, to: string): { grouping: "daily" | "weekly" | "monthly"; buckets: Bucket[] } {
  const len = Math.round((dayStart(to).getTime() - dayStart(from).getTime()) / DAY) + 1;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (len <= 31) {
    const buckets: Bucket[] = [];
    for (let i = 0; i < len; i++) {
      const d = addDays(from, i);
      buckets.push({ label: d.slice(5), from: d, to: d });
    }
    return { grouping: "daily", buckets };
  }
  if (len <= 92) {
    const buckets: Bucket[] = [];
    for (let s = from; s <= to; s = addDays(s, 7)) {
      const e = addDays(s, 6) > to ? to : addDays(s, 6);
      buckets.push({ label: s.slice(5), from: s, to: e });
    }
    return { grouping: "weekly", buckets };
  }
  const buckets: Bucket[] = [];
  let cur = from.slice(0, 7);
  while (cur <= to.slice(0, 7)) {
    const [y, m] = cur.split("-").map(Number);
    const monthStart = `${cur}-01`;
    const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const bFrom = monthStart < from ? from : monthStart;
    const bTo = monthEnd > to ? to : monthEnd;
    buckets.push({ label: months[m - 1], from: bFrom, to: bTo });
    cur = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  }
  return { grouping: "monthly", buckets };
}

export async function GET(req: Request) {
  try {
    await requireRole("owner");
    const params = new URL(req.url).searchParams;
    const fiatCurrency = ((params.get("currency") || "GHS").toUpperCase());
    const today = todayStr();
    // Range: defaults to today; clamped to [today-365, today], from <= to.
    let from = isDate(params.get("from")) ? (params.get("from") as string) : today;
    let to = isDate(params.get("to")) ? (params.get("to") as string) : today;
    if (to > today) to = today;
    if (from > to) from = to;
    if (addDays(to, -365) > from) from = addDays(to, -365);
    const rangeLen = Math.round((dayStart(to).getTime() - dayStart(from).getTime()) / DAY) + 1;
    const prevTo = addDays(from, -1);
    const prevFrom = addDays(prevTo, -(rangeLen - 1));
    const inRange = { gte: dayStart(from), lt: dayEnd(to) };
    const inPrev = { gte: dayStart(prevFrom), lt: dayEnd(prevTo) };
    const day = { gte: dayStart(today), lt: dayEnd(today) };

    const [usersTotal, usersToday, deposits, depositsToday, withdrawals, withdrawalsToday] =
      await Promise.all([
        prisma.user.count({ where: { role: "user", currency: fiatCurrency } }),
        prisma.user.count({ where: { role: "user", currency: fiatCurrency, createdAt: day } }),
        prisma.depositEvent.aggregate({ where: { fiatCurrency }, _sum: { amount: true } }),
        prisma.depositEvent.aggregate({ where: { fiatCurrency, createdAt: day }, _sum: { amount: true } }),
        prisma.withdrawal.aggregate({ where: { status: "approved", fiatCurrency }, _sum: { amount: true } }),
        prisma.withdrawal.aggregate({ where: { status: "approved", fiatCurrency, createdAt: day }, _sum: { amount: true } }),
      ]);
    const commissionToday = await totalCommissionOwed(today, today, fiatCurrency);

    // Range figures + previous equivalent period (same length, the
    // window immediately before `from`).
    const [usersRange, usersPrev, depRange, depPrev, wdRange, wdPrev, commRangeMap, commPrevMap] =
      await Promise.all([
        prisma.user.count({ where: { role: "user", currency: fiatCurrency, createdAt: inRange } }),
        prisma.user.count({ where: { role: "user", currency: fiatCurrency, createdAt: inPrev } }),
        prisma.depositEvent.aggregate({ where: { fiatCurrency, createdAt: inRange }, _sum: { amount: true } }),
        prisma.depositEvent.aggregate({ where: { fiatCurrency, createdAt: inPrev }, _sum: { amount: true } }),
        prisma.withdrawal.aggregate({ where: { status: "approved", fiatCurrency, createdAt: inRange }, _sum: { amount: true } }),
        prisma.withdrawal.aggregate({ where: { status: "approved", fiatCurrency, createdAt: inPrev }, _sum: { amount: true } }),
        commByDay(from, to, fiatCurrency),
        commByDay(prevFrom, prevTo, fiatCurrency),
      ]);
    const sumMap = (m: Map<string, number>): number => round2([...m.values()].reduce((s, v) => s + v, 0));
    const commissionRange = sumMap(commRangeMap);
    const commissionPrev = sumMap(commPrevMap);

    // Per-bucket series for the two charts, from one bounded fetch
    // each — deposits + approved withdrawals + commission payouts in
    // [from, to], and signups in [from, to] for the growth chart.
    const [rangeDeposits, rangeWithdrawals, rangePayouts, rangeSignups, usersBeforeFrom] =
      await Promise.all([
        prisma.depositEvent.findMany({
          where: { fiatCurrency, createdAt: inRange },
          select: { amount: true, createdAt: true },
        }),
        prisma.withdrawal.findMany({
          where: { status: "approved", fiatCurrency, createdAt: inRange },
          select: { amount: true, createdAt: true },
        }),
        prisma.commissionPayout.findMany({
          where: { fiatCurrency, createdAt: inRange },
          select: { amount: true, createdAt: true },
        }),
        prisma.user.findMany({
          where: { role: "user", currency: fiatCurrency, createdAt: inRange },
          select: { createdAt: true },
        }),
        prisma.user.count({ where: { role: "user", currency: fiatCurrency, createdAt: { lt: dayStart(from) } } }),
      ]);
    const { grouping, buckets } = bucketsFor(from, to);
    const inBucket = (at: Date, b: Bucket): boolean => {
      const ds = dateStr(new Date(at));
      return ds >= b.from && ds <= b.to;
    };
    const finChart = {
      grouping,
      buckets: buckets.map((b) => ({
        label: b.label,
        from: b.from,
        to: b.to,
        deposits: round2(rangeDeposits.filter((r) => inBucket(r.createdAt, b)).reduce((s, r) => s + dec(r.amount), 0)),
        depositsCount: rangeDeposits.filter((r) => inBucket(r.createdAt, b)).length,
        payouts: round2(rangeWithdrawals.filter((r) => inBucket(r.createdAt, b)).reduce((s, r) => s + dec(r.amount), 0)),
        payoutsCount: rangeWithdrawals.filter((r) => inBucket(r.createdAt, b)).length,
        commGen: round2([...commRangeMap.entries()].filter(([d]) => d >= b.from && d <= b.to).reduce((s, [, v]) => s + v, 0)),
        commPaid: round2(rangePayouts.filter((r) => inBucket(r.createdAt, b)).reduce((s, r) => s + dec(r.amount), 0)),
      })),
    };
    const growthChart = {
      grouping,
      buckets: buckets.map((b) => {
        const newUsers = rangeSignups.filter((u) => inBucket(u.createdAt, b)).length;
        const cumulative = usersBeforeFrom + rangeSignups.filter((u) => dateStr(new Date(u.createdAt)) <= b.to).length;
        return { label: b.label, from: b.from, to: b.to, newUsers, cumulative };
      }),
    };

    // Overview feed (Nov 2026) — recent activity + 7-day deposits +
    // top admins, same call, same fiat, same UTC-day logic. All from
    // the real tables; nothing is invented.
    const weekStart = new Date(`${today}T00:00:00.000Z`);
    weekStart.setUTCDate(weekStart.getUTCDate() - 6);
    const weekFrom = new Date(`${dateStr(weekStart)}T00:00:00.000Z`);
    const [recentDeposits, recentWithdrawals, recentSignups, recentPayouts, weekDeposits] =
      await Promise.all([
        prisma.depositEvent.findMany({
          where: { fiatCurrency },
          orderBy: { createdAt: "desc" },
          take: 10,
          // Select only the columns the activity feed maps: an
          // unfiltered select also pulls newer columns (providerPayload)
          // that prod may not have yet, and the whole query throws.
          // (Prisma takes either select or include — the relation lives
          // inside select here.)
          select: { amount: true, method: true, createdAt: true, user: { select: { name: true } } },
        }),
        prisma.withdrawal.findMany({
          where: { fiatCurrency },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { amount: true, status: true, createdAt: true, user: { select: { name: true } } },
        }),
        prisma.user.findMany({
          where: { role: "user", currency: fiatCurrency },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { name: true, createdAt: true },
        }),
        prisma.commissionPayout.findMany({
          where: { fiatCurrency },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { amount: true, method: true, createdAt: true, admin: { select: { name: true } } },
        }),
        prisma.depositEvent.findMany({
          where: { fiatCurrency, createdAt: { gte: weekFrom } },
          select: { amount: true, createdAt: true },
        }),
      ]);
    const activity = [
      ...recentDeposits.map((d) => ({
        kind: "deposit" as const,
        name: d.user.name,
        amount: dec(d.amount),
        detail: d.method,
        at: d.createdAt.toISOString(),
      })),
      ...recentWithdrawals.map((w) => ({
        kind: "withdrawal" as const,
        name: w.user.name,
        amount: dec(w.amount),
        detail: w.status,
        at: w.createdAt.toISOString(),
      })),
      ...recentSignups.map((u) => ({
        kind: "signup" as const,
        name: u.name,
        amount: null,
        detail: null,
        at: u.createdAt.toISOString(),
      })),
      ...recentPayouts.map((p) => ({
        kind: "commission" as const,
        name: p.admin.name,
        amount: dec(p.amount),
        detail: p.method,
        at: p.createdAt.toISOString(),
      })),
    ]
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
      .slice(0, 10);
    const deposits7d: { date: string; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(`${today}T00:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() - i);
      const ds = dateStr(d);
      deposits7d.push({
        date: ds,
        total: round2(
          weekDeposits
            .filter((w) => dateStr(new Date(w.createdAt)) === ds)
            .reduce((s, w) => s + dec(w.amount), 0),
        ),
      });
    }
    const admins = await prisma.user.findMany({ where: { role: "admin" }, select: { id: true, name: true } });
    const topAdmins = (
      await Promise.all(
        admins.map(async (a) => {
          const [summary, paid] = await Promise.all([
            commissionSummary(a.id, fiatCurrency),
            commissionPaid(a.id, undefined, undefined, fiatCurrency),
          ]);
          const earned = round2(summary.allTime);
          return {
            adminId: a.id,
            adminName: a.name,
            earned,
            paid: round2(paid),
            unpaid: Math.max(0, round2(earned - paid)),
          };
        }),
      )
    )
      .filter((a) => a.earned > 0)
      .sort((x, y) => y.earned - x.earned)
      .slice(0, 5);

    return ok({
      currency: fiatCurrency,
      date: today,
      from,
      to,
      prevFrom,
      prevTo,
      usersTotal,
      usersToday,
      usersRange,
      usersPrev,
      depositedTotal: round2(dec(deposits._sum.amount)),
      depositedToday: round2(dec(depositsToday._sum.amount)),
      depositedRange: round2(dec(depRange._sum.amount)),
      depositedPrev: round2(dec(depPrev._sum.amount)),
      paidOutTotal: round2(dec(withdrawals._sum.amount)),
      paidOutToday: round2(dec(withdrawalsToday._sum.amount)),
      paidOutRange: round2(dec(wdRange._sum.amount)),
      paidOutPrev: round2(dec(wdPrev._sum.amount)),
      commissionToday: round2(commissionToday),
      commissionRange,
      commissionPrev,
      finChart,
      growthChart,
      activity,
      deposits7d,
      topAdmins,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
