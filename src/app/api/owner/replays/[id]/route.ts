// P2 Batch 2 (O27): one replay's detail — the round's full
// GameResult row + the provably-fair verify result for crash rounds
// (recomputed from the revealed seed + SHA-256 hash check, via
// src/lib/verify.ts — the same computation the admin lookup uses).
// Non-crash rounds have no seed/hash to verify. The seed is returned
// ONLY for a finished round (verify.ts enforces that).
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { dec, round2 } from "@/lib/money";
import { getGame } from "@/lib/games";
import { verifyCrashRound, roundIdOfGameResult } from "@/lib/verify";
import { CRASH_GAME_SLUGS } from "@/lib/settle";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("owner");
    const { id } = await params;
    const r = await prisma.gameResult.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true, email: true, phone: true } } },
    });
    if (!r) return fail("Round not found", 404);
    let verify: Awaited<ReturnType<typeof verifyCrashRound>> | null = null;
    const roundId = roundIdOfGameResult(r.result);
    if (CRASH_GAME_SLUGS.has(r.game) && roundId) {
      verify = await verifyCrashRound(roundId);
    }
    return ok({
      replay: {
        id: r.id,
        userId: r.userId,
        userName: r.user?.name ?? "Unknown",
        userContact: r.user?.email ?? r.user?.phone ?? null,
        game: r.game,
        gameName: getGame(r.game)?.name ?? r.game,
        currency: r.currency,
        stake: dec(r.stake),
        payout: dec(r.payout),
        net: round2(dec(r.payout) - dec(r.stake)),
        roundId,
        createdAt: r.createdAt.toISOString(),
      },
      verify,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
