import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/http";
import { issueCrashRound } from "@/lib/crash";
import { round2 } from "@/lib/money";

/**
 * Issue a provably-fair crash round. The server picks the server seed,
 * computes the crash point with HMAC-SHA256 (see src/lib/crash.ts) and
 * returns only the SHA-256 commitment — never the seed or the point.
 * Cash-out goes through POST /api/games/settle with the multiplier the
 * player stopped at (capped at ×50 by the settle validator).
 *
 * P1 Batch 1 (A16): the issued round is also persisted, so ANY past
 * round can be verified later (the in-memory map only keeps 15
 * minutes). The write is best-effort — if the DB is down the round
 * still issues from memory and only its later verification is lost.
 */
export async function POST() {
  try {
    await requireAuth();
    const round = issueCrashRound();
    try {
      await prisma.crashRound.create({
        data: {
          roundId: round.roundId,
          serverSeed: round.serverSeed,
          clientSeed: round.clientSeed,
          nonce: round.nonce,
          crashPoint: round2(round.crashPoint),
          hash: round.hash,
        },
      });
    } catch {
      // Best-effort only — the in-memory round still plays.
    }
    return ok({
      roundId: round.roundId,
      hash: round.hash,
      clientSeed: round.clientSeed,
      nonce: round.nonce,
      startsAt: round.startsAt,
    }, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
