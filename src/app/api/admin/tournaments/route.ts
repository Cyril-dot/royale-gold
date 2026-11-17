// P2 Batch 1 (A27): tournaments & leaderboards. A tournament is a
// named contest over one game (or all games) in a time window, with a
// prize pool (in the creating admin's currency) paid as a bonus credit
// to the winner. The leaderboard
// is computed LIVE from GameResult during the tournament — points =
// total staked in the window — never stored per bet. Ending freezes
// the final standings into TournamentEntry rows and pays the winner
// (see [id]/end).
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { AuthError } from "@/lib/errors";
import { ALL_GAMES } from "@/lib/games";
import { displayStatus, gameNameFor } from "@/lib/tournaments";
import { symbolFor } from "@/lib/country";
import { round2 } from "@/lib/money";

const GAME_SLUGS = new Set([...ALL_GAMES.map((g) => g.slug), "all"]);

function serialise(t: {
  id: string; name: string; gameSlug: string; startAt: Date; endAt: Date;
  prizePool: unknown; status: string; winnerId: string | null; createdAt: Date;
}) {
  return {
    id: t.id,
    name: t.name,
    gameSlug: t.gameSlug,
    gameName: gameNameFor(t.gameSlug),
    startAt: t.startAt.toISOString(),
    endAt: t.endAt.toISOString(),
    prizePool: round2(Number(t.prizePool)),
    status: displayStatus(t),
    winnerId: t.winnerId,
    createdAt: t.createdAt.toISOString(),
  };
}

export async function GET() {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "tournaments");
    const rows = await prisma.tournament.findMany({
      where: { createdBy: admin.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    // The winner's name for ended tournaments (the detail endpoint
    // returns it too; the list needs it for the "Winner:" line).
    const winnerIds = rows.filter((t) => t.winnerId).map((t) => t.winnerId as string);
    const winners = winnerIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: winnerIds } }, select: { id: true, name: true } })
      : [];
    const winnerNameById = new Map(winners.map((w) => [w.id, w.name]));
    return ok({
      tournaments: rows.map((t) => ({
        ...serialise(t),
        winnerName: t.winnerId ? (winnerNameById.get(t.winnerId) ?? null) : null,
      })),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "tournaments");
    const body = await readJson<{ name?: string; gameSlug?: string; startAt?: string; endAt?: string; prizePool?: number }>(req);
    if (!body) return fail("Invalid JSON body");
    const name = (body.name ?? "").trim();
    if (name.length < 2 || name.length > 120) return fail("Name must be 2–120 characters");
    const gameSlug = (body.gameSlug ?? "").trim();
    if (!GAME_SLUGS.has(gameSlug)) return fail("Pick a game for this tournament (or All games)");
    const startAt = new Date(body.startAt ?? "");
    const endAt = new Date(body.endAt ?? "");
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      return fail("Give a start and an end date");
    }
    if (endAt.getTime() <= startAt.getTime()) return fail("The end must be after the start");
    const prizePool = Number(body.prizePool);
    if (!Number.isFinite(prizePool) || prizePool <= 0) return fail(`Prize pool must be above ${symbolFor(admin.currency ?? "GHS")} 0`);
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.tournament.create({
        data: {
          name, gameSlug, startAt, endAt,
          prizePool: round2(prizePool),
          status: "upcoming",
          createdBy: admin.id,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: admin.id, action: "tournament.create", targetId: created.id,
          detail: `Tournament: created "${name}" (${gameNameFor(gameSlug)}, ${startAt.toISOString().slice(0, 10)} – ${endAt.toISOString().slice(0, 10)}, prize ${symbolFor(admin.currency ?? "GHS")} ${round2(prizePool).toFixed(2)})`,
        },
      });
      return created;
    });
    return ok({ tournament: serialise(row) }, 201);
  } catch (err) {
    if (err instanceof AuthError) return toErrorResponse(err);
    if (err instanceof Error) return fail(err.message, 400);
    return toErrorResponse(err);
  }
}
