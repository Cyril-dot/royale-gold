import crypto from "node:crypto";

/**
 * Provably-fair crash point — mirrors the v48 artifact's
 * crashPointFromSeeds() line for line:
 *   hmac = HMAC-SHA256(serverSeed, clientSeed + ":" + nonce)
 *   h    = first 13 hex chars of hmac as a 52-bit integer
 *   h % 33 == 0            -> 1.00x instant crash
 *   else floor((100*2^52 - h) / (2^52 - h)) / 100, capped at 1,000,000
 * The client seed is fixed per build: "royale-gold-v48".
 */

export const CLIENT_SEED = "royale-gold-v48";

/** Multiplier growth curve shared by the crash rooms (v48):
 *  mult(elapsedMs) = exp(0.00006 * elapsedMs). */
export const CRASH_GROWTH = 0.00006;

export function crashPointFromSeeds(serverSeed: string, clientSeed: string, nonce: number): number {
  const hmacHex = crypto.createHmac("sha256", serverSeed).update(`${clientSeed}:${nonce}`).digest("hex");
  const h = parseInt(hmacHex.substring(0, 13), 16);
  const e = Math.pow(2, 52);
  if (h % 33 === 0) return 1.0;
  const raw = Math.floor((100 * e - h) / (e - h)) / 100;
  return Math.max(1.0, Math.min(raw, 1_000_000));
}

export interface CrashRound {
  roundId: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  crashPoint: number;
  hash: string; // SHA-256 commitment of the server seed, shown before takeoff
  startsAt: number; // epoch ms
  createdAt: number;
}

let nonceCounter = Math.floor(Math.random() * 1_000_000);

// v1: rounds live in memory only. A server restart loses unrevealed rounds
// (clients can still settle via /api/games/settle — the crash point is not
// re-verified there). Persist rounds in the DB before multi-instance deploy.
const rounds = new Map<string, CrashRound>();

export function issueCrashRound(): CrashRound {
  const serverSeed = crypto.randomBytes(32).toString("hex");
  const nonce = ++nonceCounter;
  const crashPoint = crashPointFromSeeds(serverSeed, CLIENT_SEED, nonce);
  const hash = crypto.createHash("sha256").update(serverSeed).digest("hex");
  const round: CrashRound = {
    roundId: crypto.randomUUID(),
    serverSeed,
    clientSeed: CLIENT_SEED,
    nonce,
    crashPoint,
    hash,
    startsAt: Date.now() + 6000,
    createdAt: Date.now(),
  };
  rounds.set(round.roundId, round);
  // Prune rounds older than 15 minutes.
  for (const [id, r] of rounds) {
    if (Date.now() - r.createdAt > 15 * 60 * 1000) rounds.delete(id);
  }
  return round;
}

export function getCrashRound(roundId: string): CrashRound | undefined {
  return rounds.get(roundId);
}

/**
 * The instant (epoch ms) the round's multiplier reaches its crash point
 * on the shared growth curve: startsAt + ln(crashPoint) / 0.00006.
 * A round is FINISHED once that instant has passed — only then may the
 * server seed be revealed. The client never learns the point early: it
 * animates the same curve and polls the reveal endpoint, which stays
 * shut until this instant.
 */
export function crashEndsAt(round: CrashRound): number {
  return round.startsAt + Math.log(Math.max(1, round.crashPoint)) / CRASH_GROWTH;
}

export function isCrashRoundFinished(round: CrashRound, now = Date.now()): boolean {
  return now >= crashEndsAt(round);
}
