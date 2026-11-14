// P1 Batch 1 (A16): provably-fair verify for crash games. Given a
// crash roundId, recompute the crash point from the revealed server
// seed (HMAC-SHA256, src/lib/crash.ts) and check SHA-256(serverSeed)
// against the hash issued with the round. The seed is returned ONLY
// for a FINISHED round — a live round's seed stays secret (same rule
// as the player-facing reveal endpoint). Rounds are read from the DB
// (persisted at issue time), with the in-memory map as a fallback for
// rounds issued before this deploy.
// P2 Batch 2 (O27): the computation lives in src/lib/verify.ts now —
// the owner's game-replay detail reuses it. This route only does auth
// + the response shape, so the two can never disagree.
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { verifyCrashRound } from "@/lib/verify";

export async function GET(req: Request) {
  try {
    const me = await requireRole("admin", "owner");
    if (me.role === "admin") requirePermission(me, "lookup");
    const roundId = new URL(req.url).searchParams.get("roundId");
    if (!roundId) return fail("roundId is required");

    const result = await verifyCrashRound(roundId);
    if (!result) return fail("Unknown crash round — rounds are kept for verification once issued", 404);
    return ok(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
