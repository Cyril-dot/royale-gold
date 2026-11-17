// P0 Batch 1 — withdrawal rules shared by the admin and owner routes.
// A withdrawal is a REQUEST only — no real money moves (deposits are
// demo cashier only). Maker-checker: an admin approves first; above the
// threshold the owner must approve second before it is final.
import { prisma } from "./prisma";
import type { WithdrawalRiskFlag } from "./withdrawal-flags";
import { WITHDRAWAL_OWNER_THRESHOLD, WITHDRAWAL_RISK_LABELS } from "./withdrawal-flags";
import { getAllCurrencyConfigs, getCurrencyConfig } from "./game-config";

export type { WithdrawalRiskFlag } from "./withdrawal-flags";
export { WITHDRAWAL_OWNER_THRESHOLD, WITHDRAWAL_RISK_LABELS } from "./withdrawal-flags";

/** Statuses: pending -> approved | admin_approved -> approved | rejected. */
export type WithdrawalStatus = "pending" | "admin_approved" | "approved" | "rejected";

/**
 * True when an admin's approval alone is NOT final — the owner must second it.
 * Phase 1 country-based (Nov 2026): the threshold is per-fiat, from
 * CurrencyConfig (GHS 500 / NGN 50,000 seed) — a bare 500 would send
 * almost every NGN withdrawal to the owner.
 */
export async function needsOwnerApproval(amount: number, fiatCurrency: string = "GHS"): Promise<boolean> {
  const cfg = await getCurrencyConfig(fiatCurrency);
  return amount > cfg.withdrawalOwnerThreshold;
}

/** The owner-approval threshold for a fiat (for the decide-route note). */
export async function withdrawalOwnerThresholdFor(fiatCurrency: string = "GHS"): Promise<number> {
  const cfg = await getCurrencyConfig(fiatCurrency);
  return cfg.withdrawalOwnerThreshold;
}

export const WITHDRAWAL_METHODS = ["MTN", "Telecel", "AirtelTigo", "card"] as const;

// P1 Batch 1 (A15): withdrawal risk flags, computed from REAL data.
//   new-account       — the player joined less than 7 days ago
//   large-vs-deposits — the amount is more than everything the player ever deposited
//   rapid             — this is the player's 3rd (or later) request in 24 hours
//   unusual           — a round amount (multiple of 100 in the player's fiat) of 1,000 or more
//                       (in the player's fiat — GHS terms, scaled by conversionRate/5;
//                       Phase 1 country-based, Nov 2026)
// (Keys + labels live in ./withdrawal-flags.ts — client-safe, so the
// Money page can import the labels without pulling in Prisma.)
export function withdrawalRiskFlags(opts: {
  userCreatedAt: Date;
  amount: number;
  totalDeposited: number;
  /** This request's position (1st, 2nd, 3rd…) among the player's
   *  requests in the last 24 hours — "rapid" is the 3rd or later. */
  requestsLast24h: number;
  /** The player's fiat scale (conversionRate/5, 1 for GHS) — scales
   * the "unusual" threshold and round step to the player's fiat. */
  fiatScale?: number;
}): WithdrawalRiskFlag[] {
  const flags: WithdrawalRiskFlag[] = [];
  if (Date.now() - opts.userCreatedAt.getTime() < 7 * 24 * 60 * 60 * 1000) flags.push("new-account");
  if (opts.amount > opts.totalDeposited) flags.push("large-vs-deposits");
  if (opts.requestsLast24h >= 3) flags.push("rapid");
  const scale = opts.fiatScale ?? 1;
  if (opts.amount >= 1000 * scale && opts.amount % (100 * scale) === 0) flags.push("unusual");
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
  const [deposits, recent, usersFiat, configs] = await Promise.all([
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
    // Phase 1 country-based (Nov 2026): per-player fiat for the
    // "unusual" threshold scaling.
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, currency: true } }),
    getAllCurrencyConfigs(),
  ]);
  const depositedByUser = new Map(deposits.map((d) => [d.userId, Number(d._sum.amount ?? 0)]));
  const fiatOf = new Map(usersFiat.map((u) => [u.id, u.currency ?? "GHS"]));
  const scaleOf = (userId: string): number => {
    const cfg = configs.find((c) => c.currency === (fiatOf.get(userId) ?? "GHS"));
    return (cfg?.conversionRate ?? 5) / 5;
  };
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
        fiatScale: scaleOf(r.userId),
      }),
    );
  }
  return out;
}
