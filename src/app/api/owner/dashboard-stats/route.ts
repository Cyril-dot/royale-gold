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
import { dec, round2, todayStr } from "@/lib/money";
import { ok, toErrorResponse } from "@/lib/http";
import { totalCommissionOwed } from "@/lib/commission";

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
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
