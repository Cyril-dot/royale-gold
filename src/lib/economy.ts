import { prisma } from "./prisma";

/**
 * SIM-vs-LIVE win-chance economy (round 6).
 *
 * The rule the user asked for: SIM is demo play where winning is EASY;
 * LIVE win chance FALLS as the user's lifetime deposited amount rises.
 *
 * How it is enforced (server-side, never trusted to the client):
 * - The factor is computed HERE, from DepositEvent rows only the server
 *   can read. The client never sends a factor.
 * - The factor is applied at the DRAW, inside POST /api/games/play: the
 *   server draws the game's random outcome with the adjusted win
 *   probability, settles the round atomically in the same request, and
 *   returns the outcome for the client to animate to. A client that skips
 *   /play cannot settle a play-gated game at all (settleGame rejects it),
 *   and a client that lies about its mode gets nothing: SIM draws carry
 *   no settle path for real cash, LIVE draws carry the LIVE factor.
 * - Crash games (Aviator/Jet Fly/Car Crash) are EXCLUDED — their crash
 *   point is provably fair via HMAC and must never be adjusted per user.
 * - Coin games are unaffected (factor 1.0): coins are play-only and no
 *   deposit ever touches them.
 *
 * Numbers (named constants so they can be tuned):
 * - SIM: win probability × SIM_WIN_BOOST, capped at SIM_WIN_PROB_CAP.
 * - LIVE: factor starts at 1.00 and falls LIVE_DECAY_PER_STEP for every
 *   LIVE_DECAY_STEP_GHS of lifetime deposits, down to LIVE_FACTOR_FLOOR.
 *   GH₵0 → 1.00 · GH₵100 → 0.95 · GH₵500 → 0.75 · GH₵1000 → 0.50 (floor).
 */

export const SIM_WIN_BOOST = 2.0;
export const SIM_WIN_PROB_CAP = 0.9;
export const LIVE_DECAY_STEP_GHS = 100;
export const LIVE_DECAY_PER_STEP = 0.05;
export const LIVE_FACTOR_FLOOR = 0.5;

/** Total GH₵ the user has ever deposited (sum of DepositEvent amounts). */
export async function getLifetimeDeposited(userId: string): Promise<number> {
  const agg = await prisma.depositEvent.aggregate({
    where: { userId },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

/** LIVE win-chance factor for a lifetime-deposited total. 1.0 → floor. */
export function liveWinFactor(lifetimeDeposited: number): number {
  const steps = Math.floor(Math.max(0, lifetimeDeposited) / LIVE_DECAY_STEP_GHS);
  return Math.max(LIVE_FACTOR_FLOOR, 1 - steps * LIVE_DECAY_PER_STEP);
}

/**
 * Win-chance factor for a round. `mode` is the mode the client claims;
 * the caller (the /play route) only ever honours SIM for demo draws —
 * SIM outcomes can never settle for real cash.
 */
export function winFactorFor(args: {
  mode: "REAL" | "SIM";
  currency: "cash" | "coins";
  lifetimeDeposited: number;
}): number {
  if (args.currency === "coins") return 1;
  if (args.mode === "SIM") return SIM_WIN_BOOST;
  return liveWinFactor(args.lifetimeDeposited);
}

/** Adjusted win probability: natural probability × factor, capped (SIM). */
export function adjustedWinProb(naturalProb: number, factor: number): number {
  return Math.min(Math.max(0, naturalProb) * factor, SIM_WIN_PROB_CAP);
}

/**
 * Draw a win/lose boolean at the adjusted probability. `rng` defaults to
 * Math.random; tests pass a seeded function for reproducible rates.
 */
export function drawWin(naturalProb: number, factor: number, rng: () => number = Math.random): boolean {
  return rng() < adjustedWinProb(naturalProb, factor);
}

/** Full economy snapshot for one user (drives GET /api/games/economy). */
export async function getEconomyForUser(userId: string) {
  const lifetimeDeposited = await getLifetimeDeposited(userId);
  return {
    lifetimeDeposited,
    liveFactor: liveWinFactor(lifetimeDeposited),
    liveFactorFloor: LIVE_FACTOR_FLOOR,
    simBoost: SIM_WIN_BOOST,
    simWinProbCap: SIM_WIN_PROB_CAP,
    decayPerStep: LIVE_DECAY_PER_STEP,
    decayStepGhs: LIVE_DECAY_STEP_GHS,
  };
}
