import { requireAuth } from "@/lib/auth";
import { ok, toErrorResponse } from "@/lib/http";
import { issueCrashRound } from "@/lib/crash";

/**
 * Issue a provably-fair crash round. The server picks the server seed,
 * computes the crash point with HMAC-SHA256 (see src/lib/crash.ts) and
 * returns only the SHA-256 commitment — never the seed or the point.
 * Cash-out goes through POST /api/games/settle with the multiplier the
 * player stopped at (capped at ×50 by the settle validator).
 */
export async function POST() {
  try {
    await requireAuth();
    const round = issueCrashRound();
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
