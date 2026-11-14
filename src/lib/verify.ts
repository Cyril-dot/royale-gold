// P2 Batch 2 (O27): provably-fair verify for crash games, extracted
// from the admin lookup verify route (P1 Batch 1 A16) so the owner's
// game-replay detail can reuse the exact same computation instead of
// duplicating it. Given a crash roundId, recompute the crash point
// from the revealed server seed (HMAC-SHA256, src/lib/crash.ts) and
// check SHA-256(serverSeed) against the hash issued with the round.
// The seed is returned ONLY for a FINISHED round — a live round's
// seed stays secret (same rule as the player-facing reveal endpoint).
// Rounds are read from the DB (persisted at issue time), with the
// in-memory map as a fallback for rounds issued before this deploy.
import crypto from "node:crypto";
import { prisma } from "./prisma";
import { dec } from "./money";
import {
  CRASH_GROWTH,
  crashPointFromSeeds,
  getCrashRound,
  isCrashRoundFinished,
} from "./crash";

export interface CrashVerifyResult {
  roundId: string;
  hash: string;
  clientSeed: string;
  nonce: number;
  finished: boolean;
  serverSeed?: string;
  crashPoint?: number;
  recomputedPoint?: number;
  pointMatch?: boolean;
  hashMatch?: boolean;
}

/**
 * A GameResult row has no roundId column — a crash settle stores the
 * roundId inside the `result` JSON (see /api/games/settle). Extract
 * it here so the replay list + detail can link a round to its crash
 * verification. null = not a crash settle.
 */
export function roundIdOfGameResult(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const roundId = (result as { roundId?: unknown }).roundId;
  return typeof roundId === "string" && roundId.length > 0 ? roundId : null;
}

/** null = unknown crash round (not in the DB, not in memory). */
export async function verifyCrashRound(roundId: string): Promise<CrashVerifyResult | null> {
  const dbRow = await prisma.crashRound.findUnique({ where: { roundId } });
  const mem = dbRow ? null : getCrashRound(roundId);
  if (!dbRow && !mem) return null;

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
    return { roundId, hash, clientSeed, nonce, finished: false };
  }

  const serverSeed = dbRow?.serverSeed ?? mem!.serverSeed;
  const recomputedPoint = crashPointFromSeeds(serverSeed, clientSeed, nonce);
  const recomputedHash = crypto.createHash("sha256").update(serverSeed).digest("hex");
  return {
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
  };
}
