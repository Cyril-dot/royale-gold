import { requireAuth } from "@/lib/auth";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { settleGame } from "@/lib/settle";

/**
 * Settle one finished game round. The client sends the outcome (stake and
 * payout); the server re-validates everything against the game catalogue
 * (currency match, stake > 0, payout <= stake × maxMultiplier) and moves
 * the money in a transaction. Client-supplied balances are never trusted.
 */
export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await readJson<{
      game?: string;
      currency?: "cash" | "coins";
      stake?: number;
      payout?: number;
      result?: Record<string, unknown>;
      roundId?: string;
    }>(req);
    if (!body) return fail("Invalid JSON body");
    if (!body.game || !body.currency) return fail("game and currency are required");
    const stake = Number(body.stake);
    const payout = Number(body.payout);
    if (!Number.isFinite(stake) || !Number.isFinite(payout)) {
      return fail("stake and payout must be numbers");
    }

    const settled = await settleGame(
      user.id,
      body.game,
      body.currency,
      stake,
      payout,
      { ...(body.result ?? {}), ...(body.roundId ? { roundId: body.roundId } : {}) },
    );
    return ok({
      game: body.game,
      currency: body.currency,
      stake,
      payout,
      cash: settled.cash,
      coins: settled.coins,
      sim: settled.sim,
      xp: settled.xp,
      level: settled.level,
      gameResultId: settled.gameResult.id,
    });
  } catch (err) {
    if (err instanceof Error) return fail(err.message, 400);
    return toErrorResponse(err);
  }
}
