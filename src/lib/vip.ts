// P2 Batch 1 (A26): VIP tiers — a label + perks text only. A player's
// tier is computed live from their total deposited: the highest tier
// whose minDeposited they have reached. VIP changes NO economy,
// limits or payouts — the pages say so. The owner edits the tiers on
// the owner panel; the admin panel only shows them.
//
// Seeding: the first read (by any admin or the owner) creates the
// three defaults under the caller's id when the table is empty —
// Bronze ≥ GH₵0, Silver ≥ GH₵500, Gold ≥ GH₵2,000.
import { prisma } from "./prisma";
import { dec, round2 } from "./money";

export interface VipTierRow {
  id: string;
  name: string;
  minDeposited: number;
  perks: string[];
  sortOrder: number;
  createdAt: string;
}

const DEFAULT_TIERS: { name: string; minDeposited: number; perks: string; sortOrder: number }[] = [
  { name: "Bronze", minDeposited: 0, perks: "Welcome badge, Standard support", sortOrder: 1 },
  { name: "Silver", minDeposited: 500, perks: "Priority support, Higher limits", sortOrder: 2 },
  { name: "Gold", minDeposited: 2000, perks: "Priority support, Higher limits, Dedicated manager", sortOrder: 3 },
];

function toRow(t: { id: string; name: string; minDeposited: unknown; perks: string; sortOrder: number; createdAt: Date }): VipTierRow {
  return {
    id: t.id,
    name: t.name,
    minDeposited: dec(t.minDeposited as string | number | null | undefined),
    perks: t.perks.split(",").map((p) => p.trim()).filter(Boolean),
    sortOrder: t.sortOrder,
    createdAt: t.createdAt.toISOString(),
  };
}

/** All tiers, lowest threshold first. Seeds the three defaults on the
 * first ever read (createdBy = the caller — the seeding is a one-off
 * bootstrap, not an admin action). */
export async function getVipTiers(seederId: string): Promise<VipTierRow[]> {
  let rows = await prisma.vipTier.findMany({ orderBy: { sortOrder: "asc" } });
  if (rows.length === 0) {
    await prisma.vipTier.createMany({
      data: DEFAULT_TIERS.map((t) => ({ ...t, createdBy: seederId })),
    });
    rows = await prisma.vipTier.findMany({ orderBy: { sortOrder: "asc" } });
  }
  return rows.map(toRow);
}

/** The tier a total deposited reaches (tiers sorted lowest first). */
export function tierFor(totalDeposited: number, tiers: VipTierRow[]): VipTierRow | null {
  let cur: VipTierRow | null = null;
  for (const t of tiers) {
    if (totalDeposited >= t.minDeposited) cur = t;
  }
  return cur;
}

export interface VipStatus {
  totalDeposited: number;
  tier: VipTierRow | null;
  nextTier: VipTierRow | null;
  /** Progress from this tier's threshold to the next, 0–100. 100 at the top tier. */
  progressPct: number;
  /** GH₵ still to deposit to reach the next tier (0 at the top tier). */
  toNext: number;
}

/** A player's VIP status from the real deposit ledger. */
export async function vipStatusFor(userId: string, seederId: string): Promise<VipStatus> {
  const [tiers, deposits] = await Promise.all([
    getVipTiers(seederId),
    prisma.depositEvent.findMany({ where: { userId }, select: { amount: true } }),
  ]);
  const total = round2(deposits.reduce((s, d) => s + dec(d.amount), 0));
  const tier = tierFor(total, tiers);
  const idx = tier ? tiers.findIndex((t) => t.id === tier.id) : -1;
  const nextTier = idx >= 0 && idx + 1 < tiers.length ? tiers[idx + 1] : null;
  const progressPct = !tier
    ? 0
    : nextTier
      ? Math.max(0, Math.min(100, Math.round(((total - tier.minDeposited) / (nextTier.minDeposited - tier.minDeposited)) * 100)))
      : 100;
  return {
    totalDeposited: total,
    tier,
    nextTier,
    progressPct,
    toNext: nextTier ? round2(nextTier.minDeposited - total) : 0,
  };
}

/** Total deposited per player, for a set of user ids. */
export async function totalsDeposited(userIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (userIds.length === 0) return out;
  const rows = await prisma.depositEvent.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, amount: true },
  });
  for (const r of rows) out.set(r.userId, round2((out.get(r.userId) ?? 0) + dec(r.amount)));
  return out;
}
