// P1 Batch 1 (A14): player segmentation, computed from REAL tables
// (User.createdAt, GameResult, DepositEvent). A player can sit in
// several segments at once; the counts are per segment.
//   new         — joined in the last 7 days
//   active      — played in the last 7 days
//   dormant     — no play in 30+ days (never played counts only once they are 30+ days old)
//   high-roller — total deposited GH₵ 500 or more
//   at-risk     — lost GH₵ 100 or more (cash net loss) in the last 7 days
//
// P2 Batch 1 (A25): extracted from the segments route so the CRM
// campaign audience picker uses the EXACT same definitions — a
// campaign to a segment must reach the same players the Players list
// shows in that segment.
import { prisma } from "./prisma";
import { dec, round2 } from "./money";

export type PlayerSegment = "new" | "active" | "dormant" | "high-roller" | "at-risk";

export const SEGMENT_LABELS: Record<PlayerSegment, string> = {
  "new": "New",
  "active": "Active",
  "dormant": "Dormant",
  "high-roller": "High roller",
  "at-risk": "At risk",
};

export const HIGH_ROLLER_MIN = 500;
export const AT_RISK_MIN = 100;

export interface PlayerSegmentInfo {
  segments: PlayerSegment[];
  totalDeposited: number;
  lastPlayedAt: string | null;
  loss7d: number;
}

/** Segment flags + totals for a set of players. `users` carries each
 * player's id + joined date (the "new" / "dormant" rules need it). */
export async function computePlayerSegments(
  users: { id: string; createdAt: Date }[],
): Promise<Map<string, PlayerSegmentInfo>> {
  const ids = users.map((u) => u.id);
  const out = new Map<string, PlayerSegmentInfo>();
  if (ids.length === 0) return out;
  const now = Date.now();
  const d7 = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const d30 = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const [results, deposits] = await Promise.all([
    prisma.gameResult.findMany({
      where: { userId: { in: ids } },
      select: { userId: true, currency: true, stake: true, payout: true, createdAt: true },
    }),
    prisma.depositEvent.findMany({
      where: { userId: { in: ids } },
      select: { userId: true, amount: true },
    }),
  ]);

  const lastPlayed = new Map<string, number>();
  const loss7d = new Map<string, number>();
  for (const r of results) {
    const t = r.createdAt.getTime();
    const prev = lastPlayed.get(r.userId);
    if (prev === undefined || t > prev) lastPlayed.set(r.userId, t);
    if (r.currency === "cash" && r.createdAt >= d7) {
      loss7d.set(r.userId, round2((loss7d.get(r.userId) ?? 0) + dec(r.stake) - dec(r.payout)));
    }
  }
  const deposited = new Map<string, number>();
  for (const d of deposits) {
    deposited.set(d.userId, round2((deposited.get(d.userId) ?? 0) + dec(d.amount)));
  }

  for (const u of users) {
    const joined = u.createdAt.getTime();
    const last = lastPlayed.get(u.id);
    const total = deposited.get(u.id) ?? 0;
    const segments: PlayerSegment[] = [];
    if (joined >= d7.getTime()) segments.push("new");
    if (last !== undefined && last >= d7.getTime()) segments.push("active");
    if ((last === undefined && joined < d30.getTime()) || (last !== undefined && last < d30.getTime())) segments.push("dormant");
    if (total >= HIGH_ROLLER_MIN) segments.push("high-roller");
    if ((loss7d.get(u.id) ?? 0) >= AT_RISK_MIN) segments.push("at-risk");
    out.set(u.id, {
      segments,
      totalDeposited: total,
      lastPlayedAt: last !== undefined ? new Date(last).toISOString() : null,
      loss7d: loss7d.get(u.id) ?? 0,
    });
  }
  return out;
}
