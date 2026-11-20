// Deposit MoMo number (Nov 2026): the number a PayTeller MoMo prompt
// goes to. Set ONCE on the user's first PayTeller deposit, saved to
// their account, reused on every later deposit — the flow never asks
// for it again, and it is changed only on the Account page.
//
// The number lives in its OWN DepositNumber table (not a User column):
// getSessionUser reads the whole User row unselected, so a User column
// missing in prod would 500 every authenticated request. A missing
// table here just degrades to "ask once".
//
// The number may differ from User.phone (the login phone) — that is
// the whole point of storing it separately. Where a number is needed
// and none is saved yet, callers fall back to the login phone; the
// payment block keys on the saved deposit number first, login phone
// second.
//
// PROD SAFETY: reads catch P2021/P2022 (table/column missing) and
// degrade to null. Writes throw a plain Error naming
// rg-deposit-number.sql — routes map it to 503.
import { prisma } from "./prisma";
import { normalizePhone } from "./payment-blocks";

export const DEPOSIT_NUMBER_SQL = "rg-deposit-number.sql";

/** Ghana MoMo numbers are 10 digits starting with 0 (054..., 024...). */
export function isValidDepositPhone(phone: string | null | undefined): boolean {
  const normalized = normalizePhone(phone);
  return normalized !== null && /^0\d{9}$/.test(normalized);
}

/** Normalize to 0XXXXXXXXX, or null when it is not a Ghana MoMo number. */
export function normalizeDepositPhone(phone: string | null | undefined): string | null {
  const normalized = normalizePhone(phone);
  if (normalized === null || !/^0\d{9}$/.test(normalized)) return null;
  return normalized;
}

function isMissingTable(err: unknown): boolean {
  const code = (err as { code?: string }).code;
  return code === "P2021" || code === "P2022";
}

/** The saved deposit number, or null (never set, or table missing). */
export async function getDepositPhone(userId: string): Promise<string | null> {
  try {
    const row = await prisma.depositNumber.findUnique({
      where: { userId },
      select: { phone: true },
    });
    return row?.phone ?? null;
  } catch (err) {
    if (isMissingTable(err)) return null;
    throw err;
  }
}

/**
 * The number the block and the push use: the saved deposit number
 * first, the login phone second, null when neither exists.
 */
export async function resolveDepositNumber(
  userId: string,
  loginPhone?: string | null,
): Promise<string | null> {
  const saved = await getDepositPhone(userId);
  if (saved) return saved;
  return normalizePhone(loginPhone);
}

/**
 * Save (or replace) the deposit number. Throws a plain Error when
 * the number is invalid, or when the table is missing in prod (the
 * route maps it to 503 naming the SQL file).
 */
export async function setDepositPhone(userId: string, phone: string): Promise<string> {
  const normalized = normalizeDepositPhone(phone);
  if (!normalized) {
    throw new Error("Enter a valid Ghana MoMo number (e.g. 0244 000 000)");
  }
  try {
    const row = await prisma.depositNumber.upsert({
      where: { userId },
      update: { phone: normalized },
      create: { userId, phone: normalized },
      select: { phone: true },
    });
    return row.phone;
  } catch (err) {
    if (isMissingTable(err)) {
      throw new Error(`Deposit-number storage is not set up yet — run ${DEPOSIT_NUMBER_SQL} in Neon first.`);
    }
    throw err;
  }
}
