// P2 Batch 1 (A27): the owner's view of one tournament — its details
// plus the leaderboard (live from GameResult while it runs, frozen
// once ended). Read-only: the owner views, the admin ends and pays.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { displayStatus, gameNameFor, tournamentLeaderboard } from "@/lib/tournaments";
import { round2 } from "@/lib/money";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("owner");
    const { id } = await params;
    const t = await prisma.tournament.findUnique({
      where: { id },
      include: { winner: { select: { id: true, name: true } } },
    });
    if (!t) return fail("Tournament not found", 404);
    const board = await tournamentLeaderboard(t);
    return ok({
      tournament: {
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
        createdAt: t.createdAt.toISOString(),
      },
      leaderboard: board,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
