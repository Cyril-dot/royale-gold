// P1 Batch 1 (A14): player segmentation — the Players list with
// segment flags computed from REAL tables (User.createdAt,
// GameResult, DepositEvent). A player can sit in several segments at
// once; the counts are per segment.
//   new        — joined in the last 7 days
//   active     — played in the last 7 days
//   dormant    — no play in 30+ days (never played counts only once they are 30+ days old)
//   high-roller — total deposited GH₵ 500 or more
//   at-risk    — lost GH₵ 100 or more (cash net loss) in the last 7 days
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { dec, round2 } from "@/lib/money";

export type PlayerSegment = "new" | "active" | "dormant" | "high-roller" | "at-risk";

export const SEGMENT_LABELS: Record<PlayerSegment, string> = {
  "new": "New",
  "active": "Active",
  "dormant": "Dormant",
  "high-roller": "High roller",
  "at-risk": "At risk",
};

const HIGH_ROLLER_MIN = 500;
const AT_RISK_MIN = 100;

export async function GET(req: Request) {
  try {
    const me = await requireRole("admin", "owner");
    const sp = new URL(req.url).searchParams;
    // Owner preview (?adminId=) scopes to that admin's players.
    const adminId = me.role === "admin" ? me.id : sp.get("adminId") || undefined;
    if (me.role === "admin") requirePermission(me, "players");
    if (me.role === "owner" && !adminId) return fail("adminId is required");
    if (!adminId) return fail("adminId is required");

    const users = await prisma.user.findMany({
      where: { referredByAdminId: adminId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, email: true, phone: true, referralCodeUsed: true, createdAt: true },
    });
    const ids = users.map((u) => u.id);
    const now = Date.now();
    const d7 = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const d30 = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [results, deposits, tags] = await Promise.all([
      prisma.gameResult.findMany({
        where: { userId: { in: ids } },
        select: { userId: true, currency: true, stake: true, payout: true, createdAt: true },
      }),
      prisma.depositEvent.findMany({
        where: { userId: { in: ids } },
        select: { userId: true, amount: true },
      }),
      prisma.playerTag.findMany({
        where: { userId: { in: ids } },
        select: { userId: true, tag: true },
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
    const tagsByUser = new Map<string, string[]>();
    for (const t of tags) {
      const list = tagsByUser.get(t.userId) ?? [];
      list.push(t.tag);
      tagsByUser.set(t.userId, list);
    }

    const players = users.map((u) => {
      const joined = u.createdAt.getTime();
      const last = lastPlayed.get(u.id);
      const total = deposited.get(u.id) ?? 0;
      const segments: PlayerSegment[] = [];
      if (joined >= d7.getTime()) segments.push("new");
      if (last !== undefined && last >= d7.getTime()) segments.push("active");
      if ((last === undefined && joined < d30.getTime()) || (last !== undefined && last < d30.getTime())) segments.push("dormant");
      if (total >= HIGH_ROLLER_MIN) segments.push("high-roller");
      if ((loss7d.get(u.id) ?? 0) >= AT_RISK_MIN) segments.push("at-risk");
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        referralCodeUsed: u.referralCodeUsed,
        createdAt: u.createdAt.toISOString(),
        totalDeposited: total,
        lastPlayedAt: last !== undefined ? new Date(last).toISOString() : null,
        segments,
        tags: tagsByUser.get(u.id) ?? [],
      };
    });

    const counts: Record<PlayerSegment, number> = {
      "new": 0, "active": 0, "dormant": 0, "high-roller": 0, "at-risk": 0,
    };
    for (const p of players) for (const s of p.segments) counts[s] += 1;

    return ok({ players, counts, total: players.length });
  } catch (err) {
    return toErrorResponse(err);
  }
}
