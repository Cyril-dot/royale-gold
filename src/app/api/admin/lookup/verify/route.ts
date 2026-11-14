// P1 Batch 1 (A16): provably-fair verify for crash games. Given a
// crash roundId, recompute the crash point from the revealed server
// seed (HMAC-SHA256, src/lib/crash.ts) and check SHA-256(serverSeed)
// against the hash issued with the round. The seed is returned ONLY
// for a FINISHED round — a live round's seed stays secret (same rule
// as the player-facing reveal endpoint). Rounds are read from the DB
// (persisted at issue time), with the in-memory map as a fallback for
// rounds issued before this deploy.
import crypto from "node:crypto";
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { dec } from "@/lib/money";
import {
  CRASH_GROWTH,
  crashPointFromSeeds,
  getCrashRound,
  isCrashRoundFinished,
} from "@/lib/crash";

export async function GET(req: Request) {
  try {
    const me = await requireRole("admin", "owner");
    if (me.role === "admin") requirePermission(me, "lookup");
    const roundId = new URL(req.url).searchParams.get("roundId");
    if (!roundId) return fail("roundId is required");

    const dbRow = await prisma.crashRound.findUnique({ where: { roundId } });
    const mem = dbRow ? null : getCrashRound(roundId);
    if (!dbRow && !mem) return fail("Unknown crash round — rounds are kept for verification once issued", 404);

    const hash = dbRow?.hash ?? mem!.hash;
    const clientSeed = dbRow?.clientSeed ?? mem!.clientSeed;
    const nonce = dbRow?.nonce ?? mem!.nonce;
    const crashPoint = dbRow ? dec(dbRow.crashPoint) : mem!.crashPoint;
    // A DB row has no startsAt — rounds start 6s after issue
    // (createdAt), and end at startsAt + ln(point) / growth.
    const finished = dbRow
      ? Date.now() >= dbRow.createdAt.getTime() + 6000 + Math.log(Math.max(1, crashPoint)) / CRASH_GROWTH
      : isCrashRoundFinished(mem!);

    if (!finished) {
      return ok({ roundId, hash, clientSeed, nonce, finished: false });
    }

    const serverSeed = dbRow?.serverSeed ?? mem!.serverSeed;
    const recomputedPoint = crashPointFromSeeds(serverSeed, clientSeed, nonce);
    const recomputedHash = crypto.createHash("sha256").update(serverSeed).digest("hex");
    return ok({
      roundId,
      hash,
      clientSeed,
      nonce,
      finished: true,
      serverSeed,
      crashPoint,
      recomputedPoint,
      pointMatch: recomputedPoint === crashPoint,
      hashMatch: recomputedHash === hash,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
