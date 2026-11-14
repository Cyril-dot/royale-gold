// P2 Batch 1 (A28): the live players & bets feed — the 20 most recent
// GameResult rows from the admin's scoped downline, newest first,
// plus the count of players active in the last 15 minutes. READ-ONLY:
// a row links to the player detail, nothing acts from the feed. The
// page polls this every 15 seconds — no websocket, no server-sent
// events (polling is the design; the page says so).
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { getGame } from "@/lib/games";
import { dec } from "@/lib/money";
import { scopedReferredUserIds } from "@/lib/hierarchy";

export async function GET(req: Request) {
  try {
    const me = await requireRole("admin", "owner");
    const sp = new URL(req.url).searchParams;
    // Owner preview (?adminId=) scopes to that admin's downline.
    const adminId = me.role === "admin" ? me.id : sp.get("adminId") || undefined;
    if (me.role === "admin") requirePermission(me, "live");
    if (!adminId) return fail("adminId is required");

    const userIds = await scopedReferredUserIds(adminId);
    const now = Date.now();
    const activeSince = new Date(now - 15 * 60 * 1000);
    const [rows, activeRows] = await Promise.all([
      userIds.length === 0
        ? []
        : prisma.gameResult.findMany({
            where: { userId: { in: userIds } },
            orderBy: { createdAt: "desc" },
            take: 20,
            include: { user: { select: { id: true, name: true } } },
          }),
      userIds.length === 0
        ? []
        : prisma.gameResult.findMany({
            where: { userId: { in: userIds }, createdAt: { gte: activeSince } },
            select: { userId: true },
          }),
    ]);
    return ok({
      feed: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        userName: r.user.name,
        game: r.game,
        gameName: getGame(r.game)?.name ?? r.game,
        currency: r.currency,
        stake: dec(r.stake),
        payout: dec(r.payout),
        net: dec(r.payout) - dec(r.stake),
        createdAt: r.createdAt.toISOString(),
      })),
      activePlayers: new Set(activeRows.map((r) => r.userId)).size,
      fetchedAt: new Date(now).toISOString(),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
