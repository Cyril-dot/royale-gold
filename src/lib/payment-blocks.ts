// Payment blocks (Nov 2026, port of BetWins
// backend/services/payment-blocks.service.js) — two failed deposits
// in 24 hours blocks the account AND the MoMo number on file from
// deposits for 24 hours.
//
// NUMBER-AWARE COUNTING (Nov 2026, Chuks's decision: the block is
// BOTH by number AND by account): every genuine failure counts toward
// BOTH tallies — the account's tally and the number's tally (the
// number normalized the same way the block lookup normalizes it).
// The threshold stays 2 failures in 24h on EITHER dimension. When
// the account tally trips, the account AND every number it failed on
// in the window are blocked. When the number tally trips, the number
// AND every account that failed on that number in the window are
// blocked — one block row per (account, number) pair, so a rotating
// attacker is blocked by userId even if they switch numbers, and a
// fresh account on a blocked number is blocked by the number row.
// ACCEPTED TRADE-OFF (his call): two legitimate users sharing one
// family MoMo number now block each other after one failure each.
//
// Why this exists: a user hammering failed MoMo prompts (wrong number,
// empty wallet, declined prompt) burns provider calls and support
// time. Two genuine failures is the tripwire — one failure is just
// bad luck.
//
// What counts as a failure (recorded by the PayTeller and Theteller
// paths):
//   - a deposit start the provider rejects (createPayment error —
//     any status except the 409 resume, which returns the original
//     checkout URL and is NOT a failure)
//   - a deposit the provider reports as terminally failed (webhook
//     payment.failed, status-poll "failed")
//   - a Theteller charge that ends failed (decline, insufficient
//     funds, invalid voucher, 5-minute timeout, no credentials)
// What does NOT count:
//   - form / validation errors (bad amount, disabled method, below
//     minimum) — no payment row exists, nothing was charged
//   - a 429 "prompt already live" resume — the prompt is still live
//   - an expired checkout — the customer never paid
//   - demo-cashier deposits — play money, no provider, and the demo
//     path cannot fail; a block can only ever be earned on PayTeller
//     or Theteller
// Failures age out of the 24-hour window on their own; a completed
// deposit does not need to reset anything because old failures stop
// counting.
//
// The block is stored as rows (not derived from the failure log) so
// the owner can list it and lift it early. The failure log itself is
// kept for the count and for support to see what happened. A rotation
// block is one row per account on the number — the owner lifts each
// row separately (lift is per row, owner-only, audit-logged).
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
 *
 * NUMBER-AWARE COUNTING: the failure counts toward BOTH the
 * account's tally and the number's tally. When either tally in the
 * last 24h reaches 2, block rows are created — one per (account,
 * number) pair that must be covered:
 *   - account tally tripped: the account + every number it failed
 *     on in the window (so both numbers are blocked too);
 *   - number tally tripped: the number + every account that failed
 *     on it in the window (so rotating accounts are blocked by
 *     userId, not just by the number).
 * A pair is skipped only when a live row already covers that exact
 * (userId, phoneNumber) pair — a user blocked only by a shared-number
 * row still gets their own row, because changing their saved number
 * would otherwise unblock them. The rows for one trip are created in
 * a single transaction so a failure mid-trip cannot leave half a
 * block behind. Returns the row created for this caller, else the
 * first row created, else null.
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
    const accountFailures = await prisma.depositFailure.count({
      where: { userId, createdAt: { gt: windowStart } },
    });
    const numberFailures = phone
      ? await prisma.depositFailure.count({
          where: { phoneNumber: phone, createdAt: { gt: windowStart } },
        })
      : 0;
    if (accountFailures < BLOCK_AFTER_FAILURES && numberFailures < BLOCK_AFTER_FAILURES) return null;

    // Which (account, number) pairs must a live block row cover?
    const pairs = new Map<string, { userId: string; phoneNumber: string | null }>();
    const addPair = (u: string, p: string | null) =>
      pairs.set(`${u}|${p ?? ""}`, { userId: u, phoneNumber: p });
    let usersOnNumber: string[] = [];
    if (numberFailures >= BLOCK_AFTER_FAILURES && phone) {
      const onNumber = await prisma.depositFailure.findMany({
        where: { phoneNumber: phone, createdAt: { gt: windowStart } },
        select: { userId: true },
        distinct: ["userId"],
      });
      usersOnNumber = onNumber.map((r) => r.userId);
      for (const u of usersOnNumber) addPair(u, phone);
    }
    if (accountFailures >= BLOCK_AFTER_FAILURES) {
      const phones = await prisma.depositFailure.findMany({
        where: { userId, createdAt: { gt: windowStart } },
        select: { phoneNumber: true },
        distinct: ["phoneNumber"],
      });
      for (const f of phones) addPair(userId, f.phoneNumber);
      if (phones.length === 0) addPair(userId, phone);
    }
    // Per-account totals (all numbers) for the reason text: a user
    // whose own tally tripped reads "2 failed deposits in 24 hours";
    // a user blocked only because the shared number tripped reads
    // "2 failed deposits on this number in 24 hours".
    const involved = [...new Set([userId, ...usersOnNumber])];
    const totals = await prisma.depositFailure.groupBy({
      by: ["userId"],
      where: { userId: { in: involved }, createdAt: { gt: windowStart } },
      _count: { _all: true },
    });
    const totalByUser = new Map(totals.map((t) => [t.userId, t._count._all]));
    const reasonFor = (u: string) =>
      (totalByUser.get(u) ?? 0) >= BLOCK_AFTER_FAILURES
        ? `${BLOCK_AFTER_FAILURES} failed deposits in 24 hours`
        : `${BLOCK_AFTER_FAILURES} failed deposits on this number in 24 hours`;

    const blockedUntil = new Date(Date.now() + BLOCK_DURATION_MS);
    let createdForCaller: PaymentBlockRow | null = null;
    let firstCreated: PaymentBlockRow | null = null;
    await prisma.$transaction(async (tx) => {
      for (const pair of pairs.values()) {
        // Skip only an exact live (userId, phoneNumber) pair — never
        // skip a user just because the shared number already has a
        // row, or a number just because the user already has one.
        const already = await tx.paymentBlock.findFirst({
          where: {
            userId: pair.userId,
            phoneNumber: pair.phoneNumber,
            blockedUntil: { gt: new Date() },
          },
          select: { id: true },
        });
        if (already) continue;
        const created = await tx.paymentBlock.create({
          data: {
            userId: pair.userId,
            phoneNumber: pair.phoneNumber,
            blockedUntil,
            reason: reasonFor(pair.userId),
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
        const row = toRow(created);
        if (!firstCreated) firstCreated = row;
        if (pair.userId === userId && !createdForCaller) createdForCaller = row;
      }
    });
    return createdForCaller ?? firstCreated;
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
