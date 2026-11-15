import { requireAuth } from "@/lib/auth";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { AuthError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { settleGame } from "@/lib/settle";
import { consumeTriviaRound, triviaFinalPayout } from "@/lib/trivia";

/**
 * Grade a trivia round. Entry is 5 coins, debited here together with
 * the payout in the same transaction. The payout is the per-answer
 * reward (1 coin per correct answer) topped up to the milestone
 * (70% -> 10, 90% -> 15, 100% -> 25 coins).
 *
 * Answers come from the server-side record (POST /api/games/trivia/
 * answer as the player plays), not from the client — unanswered
 * questions count as wrong. The response carries the full answer
 * board: every question with the player's answer and the correct one.
 */
export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await readJson<{ roundToken?: string }>(req);
    if (!body?.roundToken) return fail("roundToken is required");
    const round = consumeTriviaRound(body.roundToken, user.id);
    if (!round) return fail("Invalid or expired round token", 400);

    const answers = round.recorded.map((a) => (a === null ? -1 : a));
    let correct = 0;
    const hits = round.answers.map((answer, i) => {
      const hit = answers[i] === answer;
      if (hit) correct += 1;
      return hit;
    });
    const payoutCoins = triviaFinalPayout(correct, round.total);

    const rows = await prisma.triviaQuestion.findMany({
      where: { id: { in: round.questionIds } },
      select: { id: true, question: true, options: true, answerIndex: true, category: true },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const breakdown = round.questionIds.map((id, i) => {
      const row = byId.get(id);
      const options = (row?.options as string[]) ?? [];
      return {
        question: i + 1,
        text: row?.question ?? "",
        category: row?.category ?? "",
        options,
        yourAnswer: answers[i],
        correctAnswer: round.answers[i],
        correct: hits[i],
      };
    });

    const settled = await settleGame(user.id, "trivia", "coins", 5, payoutCoins, {
      correct,
      total: round.total,
      difficulty: round.difficulty,
      perAnswerCoins: correct,
      breakdown: breakdown.map((b) => ({ question: b.question, correct: b.correct })),
    });
    return ok({
      correct,
      total: round.total,
      difficulty: round.difficulty,
      payoutCoins,
      perAnswerCoins: correct,
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
