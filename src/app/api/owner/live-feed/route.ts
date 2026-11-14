// P2 Batch 1 (A28): the owner's live-feed preview — one admin's feed
// (?adminId=). Read-only, same shape as the admin's own feed.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { getGame } from "@/lib/games";
import { dec } from "@/lib/money";
import { scopedReferredUserIds } from "@/lib/hierarchy";

export async function GET(req: Request) {
  try {
    await requireRole("owner");
    const sp = new URL(req.url).searchParams;
    const adminId = sp.get("adminId") || undefined;
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
