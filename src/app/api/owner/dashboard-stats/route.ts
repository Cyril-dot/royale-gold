// Owner Overview dashboard stats (Nov 2026) — one call, all 7 figures,
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
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dateStr, dec, round2, todayStr } from "@/lib/money";
import { ok, toErrorResponse } from "@/lib/http";
import { commissionPaid, commissionSummary, totalCommissionOwed } from "@/lib/commission";

export async function GET(req: Request) {
  try {
    await requireRole("owner");
    const fiatCurrency = ((new URL(req.url).searchParams.get("currency") || "GHS").toUpperCase());
    const today = todayStr();
    const from = new Date(`${today}T00:00:00.000Z`);
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
    const day = { gte: from, lt: to };

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
          include: { user: { select: { name: true } } },
        }),
        prisma.withdrawal.findMany({
          where: { fiatCurrency },
          orderBy: { createdAt: "desc" },
          take: 10,
          include: { user: { select: { name: true } } },
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
          include: { admin: { select: { name: true } } },
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
      usersTotal,
      usersToday,
      depositedTotal: round2(dec(deposits._sum.amount)),
      depositedToday: round2(dec(depositsToday._sum.amount)),
      paidOutTotal: round2(dec(withdrawals._sum.amount)),
      paidOutToday: round2(dec(withdrawalsToday._sum.amount)),
      commissionToday: round2(commissionToday),
      activity,
      deposits7d,
      topAdmins,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
