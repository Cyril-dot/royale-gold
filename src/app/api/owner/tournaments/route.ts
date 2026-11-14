// P2 Batch 1 (A27): the owner's tournament oversight — one admin's
// tournaments in preview (?adminId=). Read-only: the owner views, the
// admin ends and pays.
// P2 Batch 2 (O29): no ?adminId= now returns ALL tournaments
// platform-wide (admin, status, prize pool, winner) — the owner
// oversight view. The owner ends a tournament through
// POST /api/owner/tournaments/[id]/end (the same endTournament path
// as the admin).
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { displayStatus, gameNameFor } from "@/lib/tournaments";
import { round2 } from "@/lib/money";

export async function GET(req: Request) {
  try {
    await requireRole("owner");
    const sp = new URL(req.url).searchParams;
    const adminId = sp.get("adminId") || undefined;
    const rows = await prisma.tournament.findMany({
      where: adminId ? { createdBy: adminId } : {},
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        winner: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
      },
    });
    return ok({
      tournaments: rows.map((t) => ({
        id: t.id,
        name: t.name,
        gameSlug: t.gameSlug,
        gameName: gameNameFor(t.gameSlug),
        startAt: t.startAt.toISOString(),
        endAt: t.endAt.toISOString(),
        prizePool: round2(Number(t.prizePool)),
        status: displayStatus(t),
        winnerId: t.winnerId,
        winnerName: t.winner?.name ?? null,
        adminId: t.createdBy,
        adminName: t.creator?.name ?? "Unknown",
        createdAt: t.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
