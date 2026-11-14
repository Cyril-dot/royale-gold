// P1 Batch 1 (A14): player segmentation — the Players list with
// segment flags computed from REAL tables (User.createdAt,
// GameResult, DepositEvent). A player can sit in several segments at
// once; the counts are per segment.
//   new        — joined in the last 7 days
//   active     — played in the last 7 days
//   dormant    — no play in 30+ days (never played counts only once they are 30+ days old)
//   high-roller — total deposited GH₵ 500 or more
//   at-risk    — lost GH₵ 100 or more (cash net loss) in the last 7 days
//
// P2 Batch 1 (A25): the computation lives in src/lib/segments.ts now
// (shared with the CRM campaign audience picker — one definition, so
// a campaign to a segment reaches the same players this list shows).
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { adminScopeAdminIds, adminScopeInfo } from "@/lib/hierarchy";
import { computePlayerSegments, type PlayerSegment } from "@/lib/segments";

export type { PlayerSegment };

export async function GET(req: Request) {
  try {
    const me = await requireRole("admin", "owner");
    const sp = new URL(req.url).searchParams;
    // Owner preview (?adminId=) scopes to that admin's players.
    const adminId = me.role === "admin" ? me.id : sp.get("adminId") || undefined;
    if (me.role === "admin") requirePermission(me, "players");
    if (me.role === "owner" && !adminId) return fail("adminId is required");
    if (!adminId) return fail("adminId is required");

    // P1 Batch 4 (O24): scoped — a parent admin's segments roll their
    // child admins' downlines in, each row labelled with the referring admin.
    const scopeIds = await adminScopeAdminIds(adminId);
    const users = await prisma.user.findMany({
      where: { referredByAdminId: { in: scopeIds } },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, email: true, phone: true, referralCodeUsed: true, referredByAdminId: true, createdAt: true },
    });
    const scopeAdmins = await prisma.user.findMany({
      where: { id: { in: scopeIds } },
      select: { id: true, name: true },
    });
    const adminNameById = new Map(scopeAdmins.map((a) => [a.id, a.name]));
    const segByUser = await computePlayerSegments(users);
    const tags = await prisma.playerTag.findMany({
      where: { userId: { in: users.map((u) => u.id) } },
      select: { userId: true, tag: true },
    });
    const tagsByUser = new Map<string, string[]>();
    for (const t of tags) {
      const list = tagsByUser.get(t.userId) ?? [];
      list.push(t.tag);
      tagsByUser.set(t.userId, list);
    }

    const players = users.map((u) => {
      const info = segByUser.get(u.id)!;
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        referralCodeUsed: u.referralCodeUsed,
        referredByAdminName: u.referredByAdminId ? (adminNameById.get(u.referredByAdminId) ?? null) : null,
        createdAt: u.createdAt.toISOString(),
        totalDeposited: info.totalDeposited,
        lastPlayedAt: info.lastPlayedAt,
        segments: info.segments,
        tags: tagsByUser.get(u.id) ?? [],
      };
    });

    const counts: Record<PlayerSegment, number> = {
      "new": 0, "active": 0, "dormant": 0, "high-roller": 0, "at-risk": 0,
    };
    for (const p of players) for (const s of p.segments) counts[s] += 1;

    return ok({ players, counts, total: players.length, scope: await adminScopeInfo(adminId) });
  } catch (err) {
    return toErrorResponse(err);
  }
}
