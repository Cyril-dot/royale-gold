// P2 Batch 1 (A27): end a tournament — pay the prize pool as a bonus
// credit to the winner and freeze the final standings. The winner is
// picked from the leaderboard (default rank 1); the prize uses the
// bonus-grant path — wallet credit + BalanceAdjustment kind "bonus" +
// AuditLog "bonus.grant" — so the ledger shows it as a prize, never
// as a manual adjustment. A tournament ends ONCE; the prize is paid
// once, in the same transaction as the freeze.
// P2 Batch 2 (O29): the end itself lives in src/lib/tournaments.ts
// (endTournament) now — the owner end route calls the same function,
// so the two can never disagree. This route only does the admin's
// auth + scope checks.
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { AuthError } from "@/lib/errors";
import { endTournament } from "@/lib/tournaments";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "tournaments");
    const { id } = await params;
    const body = await readJson<{ winnerId?: string }>(req);
    const t = await prisma.tournament.findUnique({ where: { id } });
    if (!t) return fail("Tournament not found", 404);
    if (t.createdBy !== admin.id) return fail("This tournament is not yours", 404);

    const result = await endTournament(t, body?.winnerId ?? null, admin.id);
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
