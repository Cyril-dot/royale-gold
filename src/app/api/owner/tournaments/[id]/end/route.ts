// P2 Batch 2 (O29): the owner ends ANY tournament platform-wide
// (the admin end route only ends the admin's own). Same shared
// endTournament path as the admin — prize paid once as a bonus credit,
// entries frozen.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { AuthError } from "@/lib/errors";
import { endTournament } from "@/lib/tournaments";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const owner = await requireRole("owner");
    const { id } = await params;
    const body = await readJson<{ winnerId?: string }>(req);
    const t = await prisma.tournament.findUnique({ where: { id } });
    if (!t) return fail("Tournament not found", 404);

    const result = await endTournament(t, body?.winnerId ?? null, owner.id);
    return ok({
      tournament: {
        id: result.ended.id, name: result.ended.name, status: result.ended.status,
        winnerId: result.ended.winnerId, winnerName: result.winner.name,
        prizePool: result.prize,
      },
      winner: { id: result.winner.id, name: result.winner.name, cash: result.winnerCash, rank: result.winnerRank },
    });
  } catch (err) {
    if (err instanceof AuthError) return toErrorResponse(err);
    if (err instanceof Error) return fail(err.message, 400);
    return toErrorResponse(err);
  }
}
