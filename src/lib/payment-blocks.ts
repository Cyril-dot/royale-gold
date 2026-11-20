// Payment blocks (Nov 2026, port of BetWins
// backend/services/payment-blocks.service.js) — two failed PayTeller
// deposits in 24 hours blocks the account AND the MoMo number on file
// from deposits for 24 hours.
//
// Why this exists: a user hammering failed MoMo prompts (wrong number,
// empty wallet, declined prompt) burns provider calls and support
// time. Two genuine failures is the tripwire — one failure is just
// bad luck.
//
// What counts as a failure (recorded by the PayTeller paths only):
//   - a deposit start the provider rejects (createPayment error —
//     any status except the 409 resume, which returns the original
//     checkout URL and is NOT a failure)
//   - a deposit the provider reports as terminally failed (webhook
//     payment.failed, status-poll "failed")
// What does NOT count:
//   - form / validation errors (bad amount, disabled method, below
//     minimum) — no payment row exists, nothing was charged
//   - a 429 "prompt already live" resume — the prompt is still live
//   - an expired checkout — the customer never paid
//   - demo-cashier deposits — play money, no provider, and the demo
//     path cannot fail; a block can only ever be earned on PayTeller
// Failures age out of the 24-hour window on their own; a completed
// deposit does not need to reset anything because old failures stop
// counting.
//
// The block is stored as a row (not derived from the failure log) so
// the owner can list it and lift it early. The failure log itself is
// kept for the count and for support to see what happened.
//
// THE NUMBER: PayTeller never shares the number the customer types
// on its hosted checkout, so number-level blocking keys on the MoMo
// number on the ACCOUNT — the SAVED deposit number first (DepositNumber
// table, set once on the first PayTeller deposit, changed only on the
// Account page), the login phone (User.phone) second. A block row
// carries that number, so a second account using the same number is
// blocked too. Account-level blocking covers PayTeller fully either
// way.
//
// PROD SAFETY: both tables do not exist in prod Neon until Chuks runs
// rg-payment-blocks.sql. Every read here catches the missing-table
// error (Prisma P2021/P2022) and degrades to unblocked — the site
// never 500s for a table it does not have yet. Only the write paths
// fail, with a plain 503 telling the owner to run the SQL first.
// Reads use explicit `select` so a future column addition cannot 500
// them either (the 17 Nov owner-500s lesson, 3833bdf).
import { prisma } from "./prisma";

export const BLOCK_AFTER_FAILURES = 2;
export const BLOCK_DURATION_MS = 24 * 60 * 60 * 1000;
export const FAILURE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface PaymentBlockRow {
  id: string;
  userId: string;
  phoneNumber: string | null;
  blockedUntil: string;
  reason: string | null;
  createdAt: string;
}

/** Ghana numbers arrive as 054..., +23354... or 23354... — one key. */
export function normalizePhone(phoneNumber: string | null | undefined): string | null {
  const raw = String(phoneNumber ?? "").trim().replace(/[\s-]/g, "");
  if (!raw) return null;
  const digits = raw.startsWith("+") ? raw.slice(1) : raw;
  if (/^233\d{9}$/.test(digits)) return `0${digits.slice(3)}`;
  return raw;
}

function isMissingTable(err: unknown): boolean {
  // Prisma P2021 = "the table does not exist", P2022 = "the column
  // does not exist" — BOTH mean "this database predates the feature".
  const code = (err as { code?: string }).code;
  return code === "P2021" || code === "P2022";
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string }).code === "P2002";
}

/** "Fri 20 Nov, 20:45" — the same en-GB shape BetWins shows. */
export function formatBlockedUntil(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "later";
  return when.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Thrown by assertPaymentsNotBlocked; the route maps it to a 403
 *  carrying code + blockedUntil so the modal can show the card. */
export class PaymentBlockedError extends Error {
  statusCode = 403;
  code = "payment_blocked";
  blockedUntil: string;
  constructor(blockedUntil: string) {
    super(
      `Too many failed payments. You can't make payments until ${formatBlockedUntil(blockedUntil)}. If you think this is a mistake, contact support.`,
    );
    this.blockedUntil = blockedUntil;
  }
}

function toRow(r: {
  id: string;
  userId: string;
  phoneNumber: string | null;
  blockedUntil: Date;
  reason: string | null;
  createdAt: Date;
}): PaymentBlockRow {
  return {
    id: r.id,
    userId: r.userId,
    phoneNumber: r.phoneNumber,
    blockedUntil: r.blockedUntil.toISOString(),
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
  };
}

/**
 * The live block for this account or this number, or null. Matches
 * by userId OR by the normalized phone — a block earned on one
 * account follows the number to another. Missing tables → null.
 */
export async function findActiveBlock({
  userId,
  phoneNumber,
}: {
  userId: string;
  phoneNumber?: string | null;
}): Promise<PaymentBlockRow | null> {
  const phone = normalizePhone(phoneNumber);
  try {
    const row = await prisma.paymentBlock.findFirst({
      where: {
        blockedUntil: { gt: new Date() },
        OR: [
          { userId },
          ...(phone ? [{ phoneNumber: phone }] : []),
        ],
      },
      orderBy: { blockedUntil: "desc" },
      select: {
        id: true,
        userId: true,
        phoneNumber: true,
        blockedUntil: true,
        reason: true,
        createdAt: true,
      },
    });
    return row ? toRow(row) : null;
  } catch (err) {
    if (isMissingTable(err)) return null;
    throw err;
  }
}

/** Throws PaymentBlockedError when a live block covers this account
 *  or number; otherwise returns null. Missing tables → unblocked. */
export async function assertPaymentsNotBlocked({
  userId,
  phoneNumber,
}: {
  userId: string;
  phoneNumber?: string | null;
}): Promise<null> {
  const block = await findActiveBlock({ userId, phoneNumber });
  if (block) throw new PaymentBlockedError(block.blockedUntil);
  return null;
}

/**
 * Record one genuine failure. Never throws — a failure to record
 * must never break the deposit flow itself; it only logs. Deduped
 * by depositRef, so a webhook + poll twin can never count twice.
 * When the user's failures in the last 24h reach 2 and no live
 * block covers them yet, a 24h block row is created and returned.
 */
export async function recordDepositFailure({
  userId,
  phoneNumber,
  depositRef,
}: {
  userId: string;
  phoneNumber?: string | null;
  depositRef: string;
}): Promise<PaymentBlockRow | null> {
  if (!userId || !depositRef) return null;
  try {
    const phone = normalizePhone(phoneNumber);
    try {
      await prisma.depositFailure.create({
        data: { userId, phoneNumber: phone, depositRef },
        select: { id: true },
      });
    } catch (err) {
      // A twin delivery of the same failure (same depositRef) is one
      // failure, not two — count it once and carry on.
      if (!isUniqueViolation(err)) throw err;
    }
    const windowStart = new Date(Date.now() - FAILURE_WINDOW_MS);
    const failures = await prisma.depositFailure.count({
      where: { userId, createdAt: { gt: windowStart } },
    });
    if (failures < BLOCK_AFTER_FAILURES) return null;
    // Already covered by a live block (own account or shared number)?
    // A blocked user cannot start a payment, so a second block row
    // for the same user can only come from a failure recorded while
    // a block was already live (webhook / poll) — never stack them.
    if (await findActiveBlock({ userId, phoneNumber: phone })) return null;
    const blockedUntil = new Date(Date.now() + BLOCK_DURATION_MS);
    const created = await prisma.paymentBlock.create({
      data: {
        userId,
        phoneNumber: phone,
        blockedUntil,
        reason: `${BLOCK_AFTER_FAILURES} failed deposits in 24 hours`,
      },
      select: {
        id: true,
        userId: true,
        phoneNumber: true,
        blockedUntil: true,
        reason: true,
        createdAt: true,
      },
    });
    return toRow(created);
  } catch (err) {
    if (isMissingTable(err)) return null;
    // Any other DB error while recording must not break the deposit
    // flow — log and carry on (the caller never awaits a throw).
    console.error("[PaymentBlocks] recordDepositFailure failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export interface ListedBlock extends PaymentBlockRow {
  userName: string | null;
  userEmail: string | null;
}

/** Active blocks for the owner panel, soonest-unblocking first.
 *  Missing tables → []. Names resolve in a second query so the
 *  block table itself carries no denormalized identity. */
export async function listActiveBlocks(): Promise<ListedBlock[]> {
  try {
    const rows = await prisma.paymentBlock.findMany({
      where: { blockedUntil: { gt: new Date() } },
      orderBy: { blockedUntil: "asc" },
      select: {
        id: true,
        userId: true,
        phoneNumber: true,
        blockedUntil: true,
        reason: true,
        createdAt: true,
      },
    });
    if (rows.length === 0) return [];
    const users = await prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.userId) } },
      select: { id: true, name: true, email: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => {
      const u = byId.get(r.userId);
      return { ...toRow(r), userName: u?.name ?? null, userEmail: u?.email ?? null };
    });
  } catch (err) {
    if (isMissingTable(err)) return [];
    throw err;
  }
}

/**
 * Owner lift: delete the block row and audit it. Returns false when
 * the block is already gone. Throws a plain Error naming
 * rg-payment-blocks.sql when the table is missing in prod — the
 * route maps it to 503 so the owner knows to run the SQL.
 */
export async function liftPaymentBlock(id: string, actorId: string): Promise<boolean> {
  try {
    const row = await prisma.paymentBlock.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!row) return false;
    await prisma.$transaction(async (tx) => {
      await tx.paymentBlock.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "payment_block.lift",
          targetId: id,
          detail: `Lifted payment block for user ${row.userId} early`,
        },
      });
    });
    return true;
  } catch (err) {
    if (isMissingTable(err)) {
      throw new Error("Payment-block tables are not set up yet — run rg-payment-blocks.sql in Neon first.");
    }
    throw err;
  }
}
