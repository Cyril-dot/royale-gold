import { requireAuth } from "@/lib/auth";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { getCrashRound, isCrashRoundFinished } from "@/lib/crash";

/**
 * Provably-fair reveal. For a FINISHED crash round only, returns the
 * server seed, nonce and crash point so anyone can recompute the point
 * (HMAC-SHA256, see src/lib/crash.ts) and check SHA-256(serverSeed)
 * against the hash issued with the round. A live round is refused
 * (403) — the seed must never leak while the multiplier is still
 * climbing. Unknown rounds are 404.
 *
 * Optional `?waitMs=<n>` (0–25000) long-polls: the server holds the
 * request until the round finishes or the wait elapses, then returns
 * the reveal — or 200 `{ "finished": false }` if still live. The crash
 * clients poll with waitMs so a flying round costs a couple of 200s
 * instead of a 403 every few hundred ms (a 403 in the browser console
 * on every poll would be pure noise).
 */
export async function GET(req: Request) {
  try {
    await requireAuth();
    const url = req.url ? new URL(req.url) : null;
    const roundId = url?.searchParams.get("roundId");
    if (!roundId) return fail("roundId query param is required");
    const round = getCrashRound(roundId);
    if (!round) return fail("Unknown crash round", 404);
    if (isCrashRoundFinished(round)) {
      return ok({
        roundId: round.roundId,
        serverSeed: round.serverSeed,
        clientSeed: round.clientSeed,
        nonce: round.nonce,
        crashPoint: round.crashPoint,
        hash: round.hash,
      });
    }
    const waitMs = Math.max(0, Math.min(25000, Number(url?.searchParams.get("waitMs") || 0) || 0));
    if (waitMs > 0) {
      const started = Date.now();
      while (Date.now() - started < waitMs) {
        await new Promise((r) => setTimeout(r, 500));
        if (isCrashRoundFinished(round)) {
          return ok({
            roundId: round.roundId,
            serverSeed: round.serverSeed,
            clientSeed: round.clientSeed,
            nonce: round.nonce,
            crashPoint: round.crashPoint,
            hash: round.hash,
          });
        }
      }
      return ok({ roundId: round.roundId, finished: false });
    }
    return fail("Round is still live — the seed is revealed only after it crashes", 403);
  } catch (err) {
    return toErrorResponse(err);
  }
}
