// Fixed deposit amount (Nov 2026, owner feature) — one fixed amount
// per fiat, set by the owner; when set, EVERY deposit in that fiat
// must be exactly that amount.
//
// PROD SAFETY: the FixedDeposit table does not exist in prod Neon
// until Chuks runs rg-fixed-deposit.sql. Every read here catches the
// missing-table error (Prisma P2021/P2022) and degrades to OFF (null) — the
// site never 500s for a table it does not have yet. Only the write
// path fails, with a plain 503 telling the owner to run the SQL first.
// Reads use explicit `select` so a future column addition cannot 500
// them either (the 17 Nov owner-500s lesson, 3833bdf).
import { prisma } from "./prisma";
import { dec, round2 } from "./money";
import { symbolFor } from "./country";

function isMissingTable(err: unknown): boolean {
  // Prisma P2021 = "the table does not exist", P2022 = "the column
  // does not exist" — BOTH mean "this database predates the feature".
  // (Was P2022-only; the win-logic nodb A/B proved a dropped TABLE
  // throws P2021, so a P2022-only guard 500s exactly the case it
  // exists to prevent — fixed here, same class, one line.)
  const code = (err as { code?: string }).code;
  return code === "P2021" || code === "P2022";
}

/** The fixed amount for one fiat, or null when OFF / table missing. */
export async function getFixedDepositAmount(currency: string): Promise<number | null> {
  const code = (currency || "GHS").toUpperCase();
  try {
    const row = await prisma.fixedDeposit.findUnique({
      where: { currency: code },
      select: { amount: true },
    });
    if (!row) return null;
    const v = dec(row.amount);
    return v > 0 ? round2(v) : null;
  } catch (err) {
    if (isMissingTable(err)) return null;
    throw err;
  }
}

/** Every fixed amount, keyed by fiat — P2021/P2022-safe (missing table → {}). */
export async function getAllFixedDeposits(): Promise<Record<string, number>> {
  try {
    const rows = await prisma.fixedDeposit.findMany({ select: { currency: true, amount: true } });
    const out: Record<string, number> = {};
    for (const r of rows) {
      const v = dec(r.amount);
      if (v > 0) out[r.currency.toUpperCase()] = round2(v);
    }
    return out;
  } catch (err) {
    if (isMissingTable(err)) return {};
    throw err;
  }
}

/**
 * Server-side enforcement for a deposit create: returns the plain
 * rejection message when a fixed amount is set for this fiat and the
 * requested amount is not exactly it, else null. Compare on round2 so
 * a 100.00 vs 100 float wobble never rejects a correct deposit.
 */
export async function enforceFixedDeposit(amount: number, fiatCurrency: string): Promise<string | null> {
  const fixed = await getFixedDepositAmount(fiatCurrency);
  if (fixed === null) return null;
  if (round2(amount) !== fixed) {
    const sym = symbolFor(fiatCurrency);
    return `Deposits are fixed at ${sym} ${fixed.toFixed(2)} for now`;
  }
  return null;
}

/**
 * Owner set/clear. amount null = clear (delete the row = OFF).
 * Throws a plain Error with a 503 message when the table is missing
 * in prod — the route maps it to 503 so the owner knows to run the SQL.
 * Always audit-logs (action "deposit.fixed_amount").
 */
export async function setFixedDepositAmount(
  actorId: string,
  currency: string,
  amount: number | null,
): Promise<number | null> {
  const code = (currency || "GHS").toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new Error("currency must be a 3-letter code (e.g. GHS, NGN)");
  let next: number | null = null;
  if (amount !== null) {
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || Math.abs(round2(amount) - amount) > 1e-9) {
      throw new Error("Fixed deposit amount must be an amount > 0");
    }
    next = round2(amount);
  }
  try {
    if (next === null) {
      await prisma.fixedDeposit.deleteMany({ where: { currency: code } });
    } else {
      await prisma.fixedDeposit.upsert({
        where: { currency: code },
        update: { amount: next },
        create: { currency: code, amount: next },
      });
    }
  } catch (err) {
    if (isMissingTable(err)) {
      throw new Error("Fixed deposits are not set up yet — run rg-fixed-deposit.sql in Neon first");
    }
    throw err;
  }
  const sym = symbolFor(code);
  await prisma.auditLog.create({
    data: {
      actorId,
      action: "deposit.fixed_amount",
      targetId: code,
      detail:
        next === null
          ? `Fixed ${code} deposit cleared — deposits are free amounts again (min deposit applies)`
          : `Fixed ${code} deposit set to ${sym} ${next.toFixed(2)} — every ${code} deposit must be exactly this amount`,
    },
  });
  return next;
}
