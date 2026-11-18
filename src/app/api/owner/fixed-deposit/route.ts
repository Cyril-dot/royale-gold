// Fixed deposit amount (Nov 2026, owner feature): POST sets one
// fixed amount per fiat (or clears it with amount: null). Owner-only.
// When set, every deposit in that fiat must be exactly that amount —
// enforced server-side in the demo cashier + PayTeller create, and
// the DepositModal locks to it.
//
// PROD SAFETY: the FixedDeposit table does not exist in prod Neon
// until Chuks runs rg-fixed-deposit.sql. A write before then fails
// here with a plain 503 (never a 500) telling him to run the SQL.
// Reads never fail: getFixedDepositAmount degrades to OFF.
import { requireRole } from "@/lib/auth";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { setFixedDepositAmount } from "@/lib/fixed-deposit";
import { round2 } from "@/lib/money";

export async function POST(req: Request) {
  try {
    const owner = await requireRole("owner");
    const body = await readJson<{ currency?: string; amount?: number | null }>(req);
    if (!body) return fail("Invalid JSON body");
    const currency = (body.currency ?? "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) return fail("currency must be a 3-letter code (e.g. GHS, NGN)");
    // amount: null (or omitted) = clear = OFF. A number must be > 0, 2dp.
    let amount: number | null = null;
    if (body.amount !== undefined && body.amount !== null) {
      const v = body.amount;
      if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || Math.abs(round2(v) - v) > 1e-9) {
        return fail("Fixed deposit amount must be an amount > 0");
      }
      amount = round2(v);
    }
    try {
      const next = await setFixedDepositAmount(owner.id, currency, amount);
      return ok({ currency, fixedDepositAmount: next });
    } catch (err) {
      // Missing table in prod → plain 503, never a 500.
      if (err instanceof Error && err.message.includes("rg-fixed-deposit.sql")) {
        return fail(err.message, 503);
      }
      throw err;
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
