// P0 Batch 2 (O1): the owner's global P&L for a period. Every figure
// comes from the real tables — nothing is invented:
//   GGR (cash)   = cash stakes − cash payouts, from GameResult
//   GGR (coins)  = coin stakes − coin payouts (play-only, shown apart)
//   Deposits     = sum of DepositEvent.amount
//   Withdrawals  = sum of Withdrawal.amount where status = approved
//                  (requests only — no real money moves)
//   Commissions  = sum of DepositEvent.commission (owed to admins)
//   Net profit   = GGR (cash) − commissions owed.
// Deposits/withdrawals are cash flow, not profit — they are shown as
// their own lines and are NOT subtracted in net profit; the formula is
// printed in the UI so the owner can see exactly what net means.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/http";
import { dec, round2, todayStr } from "@/lib/money";
// P0 Batch 3 (O4): commissions are RECOMPUTED by the rules engine —
// the stamped DepositEvent.commission is legacy history, not the figure.
import { totalCommissionOwed } from "@/lib/commission";

function parseDay(v: string | null): Date | undefined {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  return new Date(`${v}T00:00:00.000Z`);
}

export async function GET(req: Request) {
  try {
    await requireRole("owner");
    const sp = new URL(req.url).searchParams;
    const from = parseDay(sp.get("from"));
    const toRaw = parseDay(sp.get("to"));
    const to = toRaw ? new Date(toRaw.getTime() + 24 * 60 * 60 * 1000 - 1) : undefined;
    const where = { createdAt: { gte: from, lte: to } };

    const [cashRounds, coinRounds, deposits, withdrawals] = await Promise.all([
      prisma.gameResult.aggregate({
        where: { ...where, currency: "cash" },
        _sum: { stake: true, payout: true },
        _count: true,
      }),
      prisma.gameResult.aggregate({
        where: { ...where, currency: "coins" },
        _sum: { stake: true, payout: true },
        _count: true,
      }),
      prisma.depositEvent.aggregate({
        where,
        _sum: { amount: true, commission: true },
        _count: true,
      }),
      prisma.withdrawal.aggregate({
        where: { ...where, status: "approved" },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    const stakesCash = dec(cashRounds._sum.stake);
    const payoutsCash = dec(cashRounds._sum.payout);
    const stakesCoins = dec(coinRounds._sum.stake);
    const payoutsCoins = dec(coinRounds._sum.payout);
    const ggrCash = round2(stakesCash - payoutsCash);
    const ggrCoins = Math.round(stakesCoins - payoutsCoins);
    const depositTotal = dec(deposits._sum.amount);
    // P0 Batch 3 (O4): commissions owed, recomputed from the ledger by
    // the rules engine over the same period (not the stamped sum).
    const commissionTotal = await totalCommissionOwed(
      sp.get("from") ?? "2020-01-01",
      sp.get("to") ?? todayStr(),
    );
    const withdrawalTotal = dec(withdrawals._sum.amount);
    const netProfit = round2(ggrCash - commissionTotal);

    return ok({
      from: sp.get("from") ?? null,
      to: sp.get("to") ?? null,
      roundsCash: cashRounds._count,
      stakesCash: round2(stakesCash),
      payoutsCash: round2(payoutsCash),
      ggrCash,
      roundsCoins: coinRounds._count,
      stakesCoins,
      payoutsCoins,
      ggrCoins,
      deposits: round2(depositTotal),
      depositsCount: deposits._count,
      withdrawals: round2(withdrawalTotal),
      withdrawalsCount: withdrawals._count,
      commissions: round2(commissionTotal),
      netProfit,
      formula: "Net profit = GGR (cash) − commissions owed. Deposits and withdrawals are cash flow, shown apart.",
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
