// P2 Batch 1 (A27): end a tournament — pay the prize pool as a bonus
// credit to the winner and freeze the final standings. The winner is
// picked from the leaderboard (default rank 1); the prize uses the
// bonus-grant path — wallet credit + BalanceAdjustment kind "bonus" +
// AuditLog "bonus.grant" — so the ledger shows it as a prize, never
// as a manual adjustment. A tournament ends ONCE; the prize is paid
// once, in the same transaction as the freeze.
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { AuthError } from "@/lib/errors";
import { dec, round2 } from "@/lib/money";
import { displayStatus, tournamentLeaderboard } from "@/lib/tournaments";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "tournaments");
    const { id } = await params;
    const body = await readJson<{ winnerId?: string }>(req);
    const t = await prisma.tournament.findUnique({ where: { id } });
    if (!t) return fail("Tournament not found", 404);
    if (t.createdBy !== admin.id) return fail("This tournament is not yours", 404);
    if (t.status === "ended") return fail("This tournament has already ended — the prize was paid once", 400);

    const board = await tournamentLeaderboard(t);
    if (board.length === 0) return fail("No one played in this tournament — there is no winner to pay", 400);
    const winnerId = (body?.winnerId ?? "").trim() || board[0].userId;
    const winnerRow = board.find((r) => r.userId === winnerId);
    if (!winnerRow) return fail("The winner must be on the leaderboard", 400);
    const prize = round2(dec(t.prizePool));

    const result = await prisma.$transaction(async (tx) => {
      const winner = await tx.user.findUnique({ where: { id: winnerId } });
      if (!winner) throw new Error("Winner not found");
      const after = await tx.user.update({
        where: { id: winnerId },
        data: { cashBalance: round2(dec(winner.cashBalance) + prize) },
      });
      await tx.balanceAdjustment.create({
        data: {
          userId: winnerId, adminId: admin.id, wallet: "cash", direction: "credit",
          amount: prize, reason: `Tournament prize: ${t.name}`, kind: "bonus",
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: admin.id, action: "bonus.grant", targetId: winnerId,
          detail: `Tournament prize: paid GH₵ ${prize.toFixed(2)} to ${winner.name} for winning "${t.name}" (rank ${winnerRow.rank}, staked GH₵ ${winnerRow.points.toFixed(2)})`,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: admin.id, action: "tournament.end", targetId: id,
          detail: `Tournament: ended "${t.name}" — winner ${winner.name}, prize GH₵ ${prize.toFixed(2)}`,
        },
      });
      // Freeze the final standings — the leaderboard reads these rows
      // from now on, so the result can never drift.
      await tx.tournamentEntry.createMany({
        data: board.map((r) => ({ tournamentId: id, userId: r.userId, points: round2(r.points), rank: r.rank })),
      });
      const ended = await tx.tournament.update({
        where: { id },
        data: { status: "ended", winnerId },
      });
      return { ended, winner, after };
    });

    return ok({
      tournament: {
        id: result.ended.id, name: result.ended.name, status: displayStatus(result.ended),
        winnerId: result.ended.winnerId, winnerName: result.winner.name,
        prizePool: prize,
      },
      winner: { id: result.winner.id, name: result.winner.name, cash: dec(result.after.cashBalance) },
    });
  } catch (err) {
    if (err instanceof AuthError) return toErrorResponse(err);
    if (err instanceof Error) return fail(err.message, 400);
    return toErrorResponse(err);
  }
}
