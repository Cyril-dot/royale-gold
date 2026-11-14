// P2 Batch 1 (A27): tournaments & leaderboards. Points = total staked
// in the tournament's game(s) inside [startAt, endAt], computed LIVE
// from GameResult while the tournament runs — never stored per bet.
// TournamentEntry rows are the FROZEN final standings, written only
// when the tournament ends.
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getGame } from "./games";
import { dec, round2 } from "./money";
import { scopedReferredUserIds } from "./hierarchy";

export type TournamentStatus = "upcoming" | "active" | "closed" | "ended";

/** Display status: "ended" is stored; the rest derive from the window.
 * "closed" = the window has passed but the admin has not ended it yet
 * (the prize is still unpaid — the page says so). */
export function displayStatus(t: { status: string; startAt: Date; endAt: Date }): TournamentStatus {
  if (t.status === "ended") return "ended";
  const now = Date.now();
  if (now < t.startAt.getTime()) return "upcoming";
  if (now > t.endAt.getTime()) return "closed";
  return "active";
}

export interface LeaderboardRow {
  rank: number;
  userId: string;
  userName: string;
  userContact: string | null;
  points: number;
}

/** The leaderboard for a tournament. While it runs: live from
 * GameResult over the creator's scoped downline. Once ended: the
 * frozen TournamentEntry rows. Only players with points > 0 appear. */
export async function tournamentLeaderboard(t: {
  id: string;
  createdBy: string;
  gameSlug: string;
  startAt: Date;
  endAt: Date;
  status: string;
}): Promise<LeaderboardRow[]> {
  if (t.status === "ended") {
    const entries = await prisma.tournamentEntry.findMany({
      where: { tournamentId: t.id },
      orderBy: { rank: "asc" },
      include: { user: { select: { id: true, name: true, email: true, phone: true } } },
    });
    return entries.map((e) => ({
      rank: e.rank,
      userId: e.userId,
      userName: e.user.name,
      userContact: e.user.email ?? e.user.phone ?? null,
      points: dec(e.points),
    }));
  }
  const userIds = await scopedReferredUserIds(t.createdBy);
  if (userIds.length === 0) return [];
  const rows = await prisma.gameResult.findMany({
    where: {
      userId: { in: userIds },
      ...(t.gameSlug === "all" ? {} : { game: t.gameSlug }),
      createdAt: { gte: t.startAt, lte: t.endAt },
    },
    select: { userId: true, stake: true },
  });
  const points = new Map<string, number>();
  for (const r of rows) points.set(r.userId, round2((points.get(r.userId) ?? 0) + dec(r.stake)));
  const users = await prisma.user.findMany({
    where: { id: { in: [...points.keys()] } },
    select: { id: true, name: true, email: true, phone: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  return [...points.entries()]
    .filter(([, p]) => p > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([userId, p], i) => ({
      rank: i + 1,
      userId,
      userName: byId.get(userId)?.name ?? "—",
      userContact: byId.get(userId)?.email ?? byId.get(userId)?.phone ?? null,
      points: p,
    }));
}

export function gameNameFor(slug: string): string {
  if (slug === "all") return "All games";
  return getGame(slug)?.name ?? slug;
}

/**
 * End a tournament — pay the prize pool as a bonus credit to the
 * winner and freeze the final standings. The winner is picked from
 * the leaderboard (default rank 1); the prize uses the bonus-grant
 * path — wallet credit + BalanceAdjustment kind "bonus" + AuditLog
 * "bonus.grant" — so the ledger shows it as a prize, never as a
 * manual adjustment. A tournament ends ONCE; the prize is paid once,
 * in the same transaction as the freeze. Shared by the admin end
 * route (A27) and the owner end route (O29) — the only difference is
 * who may call it (the admin who created it, or the owner for any
 * tournament); the scope check lives in the route, not here.
 */
export async function endTournament(
  t: { id: string; name: string; createdBy: string; gameSlug: string; startAt: Date; endAt: Date; status: string; prizePool: Prisma.Decimal | number },
  winnerId: string | null,
  actorId: string,
): Promise<{
  ended: { id: string; name: string; status: string; winnerId: string | null };
  winner: { id: string; name: string };
  winnerCash: number;
  prize: number;
  winnerRank: number;
}> {
  if (t.status === "ended") throw new Error("This tournament has already ended — the prize was paid once");
  const board = await tournamentLeaderboard(t);
  if (board.length === 0) throw new Error("No one played in this tournament — there is no winner to pay");
  const wanted = (winnerId ?? "").trim();
  if (wanted && !board.some((r) => r.userId === wanted)) {
    throw new Error("The winner must be on the leaderboard");
  }
  const winnerRow = board.find((r) => r.userId === wanted) ?? board[0];
  const prize = round2(dec(t.prizePool));
  const result = await prisma.$transaction(async (tx) => {
    const winner = await tx.user.findUnique({ where: { id: winnerRow.userId } });
    if (!winner) throw new Error("Winner not found");
    const after = await tx.user.update({
      where: { id: winnerRow.userId },
      data: { cashBalance: round2(dec(winner.cashBalance) + prize) },
    });
    await tx.balanceAdjustment.create({
      data: {
        userId: winnerRow.userId, adminId: actorId, wallet: "cash", direction: "credit",
        amount: prize, reason: `Tournament prize: ${t.name}`, kind: "bonus",
      },
    });
    await tx.auditLog.create({
      data: {
        actorId, action: "bonus.grant", targetId: winnerRow.userId,
        detail: `Tournament prize: paid GH₵ ${prize.toFixed(2)} to ${winner.name} for winning "${t.name}" (rank ${winnerRow.rank}, staked GH₵ ${winnerRow.points.toFixed(2)})`,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId, action: "tournament.end", targetId: t.id,
        detail: `Tournament: ended "${t.name}" — winner ${winner.name}, prize GH₵ ${prize.toFixed(2)}`,
      },
    });
    // Freeze the final standings — the leaderboard reads these rows
    // from now on, so the result can never drift.
    await tx.tournamentEntry.createMany({
      data: board.map((r) => ({ tournamentId: t.id, userId: r.userId, points: round2(r.points), rank: r.rank })),
    });
    const ended = await tx.tournament.update({
      where: { id: t.id },
      data: { status: "ended", winnerId: winnerRow.userId },
    });
    return { ended, winner, after };
  });
  return {
    ended: { id: result.ended.id, name: result.ended.name, status: displayStatus(result.ended), winnerId: result.ended.winnerId },
    winner: { id: result.winner.id, name: result.winner.name },
    winnerCash: dec(result.after.cashBalance),
    prize,
    winnerRank: winnerRow.rank,
  };
}
