// P0 Batch 1 — withdrawal rules shared by the admin and owner routes.
// A withdrawal is a REQUEST only — no real money moves (deposits are
// demo cashier only). Maker-checker: an admin approves first; above the
// threshold the owner must approve second before it is final.
import { prisma } from "./prisma";
import type { WithdrawalRiskFlag } from "./withdrawal-flags";
import { WITHDRAWAL_OWNER_THRESHOLD, WITHDRAWAL_RISK_LABELS } from "./withdrawal-flags";

export type { WithdrawalRiskFlag } from "./withdrawal-flags";
export { WITHDRAWAL_OWNER_THRESHOLD, WITHDRAWAL_RISK_LABELS } from "./withdrawal-flags";

/** Statuses: pending -> approved | admin_approved -> approved | rejected. */
export type WithdrawalStatus = "pending" | "admin_approved" | "approved" | "rejected";

/** True when an admin's approval alone is NOT final — the owner must second it. */
export function needsOwnerApproval(amount: number): boolean {
  return amount > WITHDRAWAL_OWNER_THRESHOLD;
}

export const WITHDRAWAL_METHODS = ["MTN", "Telecel", "AirtelTigo", "card"] as const;

// P1 Batch 1 (A15): withdrawal risk flags, computed from REAL data.
//   new-account       — the player joined less than 7 days ago
//   large-vs-deposits — the amount is more than everything the player ever deposited
//   rapid             — this is the player's 3rd (or later) request in 24 hours
//   unusual           — a round amount (multiple of GH₵ 100) of GH₵ 1,000 or more
// (Keys + labels live in ./withdrawal-flags.ts — client-safe, so the
// Money page can import the labels without pulling in Prisma.)
export function withdrawalRiskFlags(opts: {
  userCreatedAt: Date;
  amount: number;
  totalDeposited: number;
  /** This request's position (1st, 2nd, 3rd…) among the player's
   *  requests in the last 24 hours — "rapid" is the 3rd or later. */
  requestsLast24h: number;
}): WithdrawalRiskFlag[] {
  const flags: WithdrawalRiskFlag[] = [];
  if (Date.now() - opts.userCreatedAt.getTime() < 7 * 24 * 60 * 60 * 1000) flags.push("new-account");
  if (opts.amount > opts.totalDeposited) flags.push("large-vs-deposits");
  if (opts.requestsLast24h >= 3) flags.push("rapid");
  if (opts.amount >= 1000 && opts.amount % 100 === 0) flags.push("unusual");
  return flags;
}

/**
 * Annotate withdrawal rows with their risk flags. One aggregate pass per
 * input set (deposits + 24h request counts), so the queue stays cheap.
 * `rows` must carry the player's createdAt (include user.createdAt).
 */
export async function annotateWithdrawalFlags<T extends { id: string; userId: string; amount: number; user: { createdAt: Date } }>(
  rows: T[],
): Promise<Map<string, WithdrawalRiskFlag[]>> {
  const out = new Map<string, WithdrawalRiskFlag[]>();
  if (rows.length === 0) return out;
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [deposits, recent] = await Promise.all([
    prisma.depositEvent.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds } },
      _sum: { amount: true },
    }),
    // The 24h requests per user, oldest first — a request is "rapid"
    // only when it IS the 3rd (or later) request in 24 hours, not
    // merely because the player later made 3 requests.
    prisma.withdrawal.findMany({
      where: { userId: { in: userIds }, createdAt: { gte: dayAgo } },
      select: { id: true, userId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const depositedByUser = new Map(deposits.map((d) => [d.userId, Number(d._sum.amount ?? 0)]));
  const ordinalById = new Map<string, number>();
  const seenByUser = new Map<string, number>();
  for (const w of recent) {
    const n = (seenByUser.get(w.userId) ?? 0) + 1;
    seenByUser.set(w.userId, n);
    ordinalById.set(w.id, n);
  }
  for (const r of rows) {
    out.set(
      r.id,
      withdrawalRiskFlags({
        userCreatedAt: r.user.createdAt,
        amount: r.amount,
        totalDeposited: depositedByUser.get(r.userId) ?? 0,
        requestsLast24h: ordinalById.get(r.id) ?? 0,
      }),
    );
  }
  return out;
}
