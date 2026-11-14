import { requireAuth } from "@/lib/auth";
import { getGame } from "@/lib/games";
import { getLifetimeDeposited, winFactorFor } from "@/lib/economy";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { drawRoulette, PLAY_GATED_GAMES, type RouletteBetKind } from "@/lib/play";
import { round2 } from "@/lib/money";
import { settleGame } from "@/lib/settle";

/**
 * Server-decided play (round 6, SIM-vs-LIVE economy).
 *
 * The server draws the outcome with the economy factor applied and, in
 * REAL mode, settles the round atomically in the same request — so there
 * is no way to fish for wins: every draw costs the stake, win or lose.
 * The client animates to the returned outcome (pocket) and displays the
 * returned payout; it never decides anything.
 *
 * - REAL: draw + settleGame (money moves on the server). Returns the new
 *   balances, like /api/games/settle.
 * - SIM: draw only, no money moves anywhere. The client settles against
 *   its in-memory SIM counter. A SIM outcome can never be settled for
 *   real cash — /api/games/settle rejects play-gated games outright.
 * - Crash games are never here: their HMAC crash point is provably fair
 *   and is never adjusted per user.
 *
 * v1 supports Royale Roulette only. More games plug into the same shape:
 * add the slug to PLAY_GATED_GAMES and a draw function in lib/play.ts.
 */
const BET_KINDS = new Set(["straight", "red", "black", "even", "odd"]);

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    // P0 Batch 1 (A8): a blocked player cannot place a bet — checked here
    // before the draw so SIM draws are blocked too (settleGame covers the
    // REAL path).
    if (user.blockedAt) return fail("This account is blocked and cannot place bets", 403);
    const body = await readJson<{
      game?: string;
      currency?: "cash" | "coins";
      stake?: number;
      mode?: "REAL" | "SIM";
      choice?: { betKind?: string; pick?: number };
    }>(req);
    if (!body) return fail("Invalid JSON body");
    const game = body.game ? getGame(body.game) : undefined;
    if (!game || !PLAY_GATED_GAMES.has(game.slug)) {
      return fail("This game is not a play-gated game — settle via /api/games/settle");
    }
    if (body.currency !== game.currency) {
      return fail(`${game.name} is a ${game.currency} game`);
    }
    const stake = Number(body.stake);
    if (!Number.isFinite(stake) || stake <= 0) return fail("Stake must be > 0");
    const mode = body.mode === "SIM" ? "SIM" : "REAL";
    const betKind = body.choice?.betKind;
    if (!betKind || !BET_KINDS.has(betKind)) return fail("A valid bet type is required");
    const pick = Number(body.choice?.pick ?? 7);
    if (betKind === "straight" && (!Number.isInteger(pick) || pick < 0 || pick > 36)) {
      return fail("Pick a number from 0 to 36");
    }

    const lifetimeDeposited = await getLifetimeDeposited(user.id);
    const factor = winFactorFor({ mode, currency: game.currency, lifetimeDeposited });
    const { pocket, won, mult } = drawRoulette(betKind as RouletteBetKind, pick, factor);
    const payout = round2(stake * mult);

    if (mode === "SIM") {
      return ok({
        game: game.slug, currency: game.currency, stake, payout,
        pocket, won, mult, factor, mode, lifetimeDeposited,
      });
    }

    const settled = await settleGame(user.id, game.slug, game.currency, stake, payout, {
      bet: betKind, pick, out: pocket,
      economy: { mode, factor, lifetimeDeposited },
    }, { viaPlay: true });
    return ok({
      game: game.slug, currency: game.currency, stake, payout,
      pocket, won, mult, factor, mode, lifetimeDeposited,
      cash: settled.cash, coins: settled.coins, sim: settled.sim,
      xp: settled.xp, level: settled.level,
      gameResultId: settled.gameResult.id,
    });
  } catch (err) {
    if (err instanceof Error) return fail(err.message, 400);
    return toErrorResponse(err);
  }
}
