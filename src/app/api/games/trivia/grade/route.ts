import { requireAuth } from "@/lib/auth";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { AuthError } from "@/lib/errors";
import { settleGame } from "@/lib/settle";
import { consumeTriviaRound, triviaPayout } from "@/lib/trivia";

/**
 * Grade a trivia round. Entry is 5 coins, debited here together with the
 * payout in the same transaction (7→10, 9→15, 10→25 coins). The round
 * token is single-use; answers are compared against the server-stored key.
 */
export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await readJson<{ roundToken?: string; answers?: number[] }>(req);
    if (!body?.roundToken || !Array.isArray(body.answers)) {
      return fail("roundToken and answers are required");
    }
    const round = consumeTriviaRound(body.roundToken, user.id);
    if (!round) return fail("Invalid or expired round token", 400);
    if (body.answers.length !== 10) return fail("Exactly 10 answers are required");

    let correct = 0;
    const breakdown = round.answers.map((answer, i) => {
      const hit = body.answers![i] === answer;
      if (hit) correct += 1;
      return { question: i + 1, correct: hit };
    });
    const payoutCoins = triviaPayout(correct);

    const settled = await settleGame(user.id, "trivia", "coins", 5, payoutCoins, {
      correct,
      total: 10,
      breakdown,
    });
    return ok({
      correct,
      total: 10,
      payoutCoins,
      cash: settled.cash,
      coins: settled.coins,
      breakdown,
    });
  } catch (err) {
    if (err instanceof AuthError) return toErrorResponse(err);
    if (err instanceof Error) return fail(err.message, 400);
    return toErrorResponse(err);
  }
}
