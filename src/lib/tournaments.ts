// P2 Batch 1 (A27): tournaments & leaderboards. Points = total staked
// in the tournament's game(s) inside [startAt, endAt], computed LIVE
// from GameResult while the tournament runs — never stored per bet.
// TournamentEntry rows are the FROZEN final standings, written only
// when the tournament ends.
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
