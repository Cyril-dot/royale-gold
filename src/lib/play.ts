import { randomInt } from "crypto";
import { adjustedWinProb, SIM_WIN_PROB_CAP } from "./economy";

/**
 * Server-decided game draws (round 6). Only games listed in
 * PLAY_GATED_GAMES may settle through POST /api/games/play — the server
 * draws the random outcome with the economy factor applied, settles the
 * round atomically, and the client animates to the returned outcome.
 * Settle via /api/games/settle is rejected for these games, so a client
 * cannot bypass the draw (no fishing: every /play call settles, the stake
 * is debited whether the round wins or not).
 *
 * Crash games are NOT here — their HMAC crash point is provably fair and
 * is never adjusted per user.
 */

/** Games whose ONLY settle path is POST /api/games/play. */
export const PLAY_GATED_GAMES = new Set(["royale-roulette"]);

export type RouletteBetKind = "straight" | "red" | "black" | "even" | "odd";

export const RED_NUMS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

/** Natural win probability of a roulette bet (European wheel, 0–36). */
export function rouletteNaturalProb(betKind: RouletteBetKind): number {
  return betKind === "straight" ? 1 / 37 : 18 / 37;
}

export function rouletteMultiplier(betKind: RouletteBetKind): number {
  return betKind === "straight" ? 36 : 2;
}

function isWinningPocket(betKind: RouletteBetKind, pick: number, pocket: number): boolean {
  if (betKind === "straight") return pocket === pick;
  if (betKind === "red") return RED_NUMS.has(pocket);
  if (betKind === "black") return pocket !== 0 && !RED_NUMS.has(pocket);
  if (betKind === "even") return pocket !== 0 && pocket % 2 === 0;
  return pocket % 2 === 1; // odd (0 is neither — it loses)
}

function drawPocketFrom(winning: boolean, betKind: RouletteBetKind, pick: number): number {
  // Rejection-draw a pocket from the winning (or losing) set. Bounded
  // loop: the smallest winning set is 1/37, so a few tries suffice.
  for (let i = 0; i < 200; i++) {
    const pocket = randomInt(0, 37);
    if (isWinningPocket(betKind, pick, pocket) === winning) return pocket;
  }
  // Fallback (unreachable in practice): the first pocket of the right set.
  if (winning) return betKind === "straight" ? pick : betKind === "red" ? 1 : betKind === "black" ? 2 : betKind === "even" ? 2 : 1;
  return betKind === "straight" ? (pick + 1) % 37 : 0;
}

/**
 * Draw a roulette round at the economy-adjusted win probability.
 * Returns the pocket the wheel must land on, whether it won, and the
 * multiplier. The draw is exact: win chance = adjustedWinProb(natural, factor).
 *
 * Win controls (Nov 2026): `opts.baseProb` is the owner's per-game
 * win chance for this game (0..1) — it REPLACES the natural
 * probability as the base, and the LIVE factor still applies ON TOP
 * of it (base x factor). Unset = today's behaviour (natural x factor,
 * via adjustedWinProb — untouched, so the no-override path is
 * byte-identical to before). The SIM cap (0.9) applies in SIM mode
 * only: in REAL mode an owner-set 100% is honestly 100% — capping it
 * at 90% would make the panel lie. Only the play route passes a base
 * probability, and only for games in PLAY_GATED_GAMES.
 */
export function drawRoulette(
  betKind: RouletteBetKind,
  pick: number,
  factor: number,
  rng: () => number = Math.random,
  opts: { baseProb?: number; sim?: boolean } = {},
): { pocket: number; won: boolean; mult: number } {
  const natural = rouletteNaturalProb(betKind);
  const prob =
    opts.baseProb != null
      ? opts.sim
        ? Math.min(Math.max(0, opts.baseProb) * factor, SIM_WIN_PROB_CAP)
        : Math.min(Math.max(0, opts.baseProb) * factor, 1)
      : adjustedWinProb(natural, factor);
  const won = rng() < prob;
  const pocket = drawPocketFrom(won, betKind, pick);
  const mult = won ? rouletteMultiplier(betKind) : 0;
  return { pocket, won, mult };
}
