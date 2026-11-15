import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/http";
import { createTriviaRound, parseDifficulty, TRIVIA_DIFFICULTIES } from "@/lib/trivia";

/**
 * Deal a trivia round: N random questions from the chosen difficulty
 * pool, without answers. Query params:
 *   difficulty=easy|medium|hard (default medium)
 *   count=5|10 (default 10)
 *   time=10|15|20 seconds per question (default = the difficulty's clock)
 */
export async function GET(req: Request) {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);
    const difficulty = parseDifficulty(url.searchParams.get("difficulty"));
    const countRaw = Number(url.searchParams.get("count") ?? 10);
    const count = countRaw === 5 ? 5 : 10;
    const timeRaw = Number(url.searchParams.get("time") ?? 0);
    const timePerQ =
      timeRaw === 10 || timeRaw === 15 || timeRaw === 20
        ? timeRaw
        : TRIVIA_DIFFICULTIES[difficulty].timePerQ;
    const all = await prisma.triviaQuestion.findMany({
      where: { difficulty },
      select: { id: true, question: true, options: true, answerIndex: true, category: true },
    });
    if (all.length < count) {
      return ok({ error: `Not enough ${difficulty} questions yet` }, 503);
    }
    const shuffled = [...all].sort(() => Math.random() - 0.5).slice(0, count);
    const round = createTriviaRound(
      user.id,
      shuffled.map((q) => q.id),
      shuffled.map((q) => q.answerIndex),
      difficulty,
      timePerQ,
    );
    return ok({
      roundToken: round.token,
      difficulty,
      total: count,
      timePerQ,
      questions: shuffled.map((q) => ({
        id: q.id,
        question: q.question,
        options: q.options as string[],
        category: q.category,
      })),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
