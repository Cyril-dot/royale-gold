// P1 Batch 4 (O25): cashier / gateway balances — what the platform
// holds per payment method, as the platform sees it. All figures come
// from the real tables (DepositEvent, Withdrawal, CommissionPayout,
// User.cashBalance); nothing is invented. Deposits are demo cashier
// only (no real payment gateway), so these are the platform's own
// ledger figures, not a gateway provider's balance.
//
// The reconciliation note is shown plainly on the page: the expected
// cash on hand (total deposits − total approved withdrawals − total
// commission paid out) vs the actual wallet balances (the sum of every
// user's cash balance). They WILL differ — game winnings come from the
// house — and the difference is the house's net position, not an error.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/http";
import { dec, round2 } from "@/lib/money";

const METHOD_ORDER = ["MTN", "Telecel", "AirtelTigo", "card"];

export async function GET() {
  try {
    await requireRole("owner");
    const [deposits, withdrawals, payouts, users] = await Promise.all([
      prisma.depositEvent.findMany({ select: { method: true, amount: true } }),
      prisma.withdrawal.findMany({
        where: { status: "approved" },
        select: { method: true, amount: true },
      }),
      prisma.commissionPayout.aggregate({ _sum: { amount: true } }),
      prisma.user.aggregate({ _sum: { cashBalance: true } }),
    ]);
    const byMethod = new Map<string, { deposited: number; withdrawn: number }>();
    for (const d of deposits) {
      const row = byMethod.get(d.method) ?? { deposited: 0, withdrawn: 0 };
      row.deposited = round2(row.deposited + dec(d.amount));
      byMethod.set(d.method, row);
    }
    for (const w of withdrawals) {
      const row = byMethod.get(w.method) ?? { deposited: 0, withdrawn: 0 };
      row.withdrawn = round2(row.withdrawn + dec(w.amount));
      byMethod.set(w.method, row);
    }
    const methods = [...byMethod.keys()].sort(
      (a, b) =>
        (METHOD_ORDER.includes(a) ? METHOD_ORDER.indexOf(a) : 99) -
        (METHOD_ORDER.includes(b) ? METHOD_ORDER.indexOf(b) : 99),
    );
    const perMethod = methods.map((method) => {
      const row = byMethod.get(method)!;
      return { method, deposited: row.deposited, withdrawn: row.withdrawn, net: round2(row.deposited - row.withdrawn) };
    });
    const totalDeposited = round2(perMethod.reduce((s, m) => s + m.deposited, 0));
    const totalWithdrawn = round2(perMethod.reduce((s, m) => s + m.withdrawn, 0));
    const totalCommissionPaid = dec(payouts._sum.amount);
    const expectedCashOnHand = round2(totalDeposited - totalWithdrawn - totalCommissionPaid);
    const actualWalletBalances = dec(users._sum.cashBalance);
    return ok({
      perMethod,
      totals: {
        deposited: totalDeposited,
        withdrawn: totalWithdrawn,
        net: round2(totalDeposited - totalWithdrawn),
      },
      reconciliation: {
        totalDeposited,
        totalWithdrawn,
        totalCommissionPaid,
        expectedCashOnHand,
        actualWalletBalances,
        difference: round2(actualWalletBalances - expectedCashOnHand),
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
