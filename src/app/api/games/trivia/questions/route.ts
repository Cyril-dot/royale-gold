import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/http";
import { createTriviaRound, parseDifficulty, TRIVIA_DIFFICULTIES } from "@/lib/trivia";
import { generateTriviaQuestions, generatedCountFor } from "@/lib/trivia-gen";

/**
 * Deal a trivia round: N questions from the chosen difficulty pool —
 * a mix of curated bank questions and questions generated at deal
 * time (see src/lib/trivia-gen.ts; TRIVIA_GENERATED_SHARE of the
 * round is generated, the rest is bank). No answers are returned; the
 * round token holds them server-side.
 * Query params:
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
    // Bank first, then generated — the bank is finite, so if it cannot
    // cover its share the generator fills the rest of the round.
    const bankCount = Math.min(count - generatedCountFor(count), all.length);
    const shuffledBank = [...all].sort(() => Math.random() - 0.5).slice(0, bankCount);
    const generated = generateTriviaQuestions(
      difficulty,
      count - bankCount,
      shuffledBank.map((q) => q.question),
    );
    if (shuffledBank.length + generated.length < count) {
      return ok({ error: `Not enough ${difficulty} questions yet` }, 503);
    }
    const dealt = [
      ...shuffledBank.map((q) => ({
        id: q.id,
        question: q.question,
        options: q.options as string[],
        answerIndex: q.answerIndex,
        category: q.category,
      })),
      ...generated.map((g) => ({
        id: g.id,
        question: g.question,
        options: [...g.options],
        answerIndex: g.answerIndex,
        category: g.category,
      })),
    ].sort(() => Math.random() - 0.5);
    const round = createTriviaRound(
      user.id,
      dealt.map((q) => q.id),
      dealt.map((q) => q.answerIndex),
      difficulty,
      timePerQ,
      generated,
    );
    return ok({
      roundToken: round.token,
      difficulty,
      total: count,
      timePerQ,
      questions: dealt.map((q) => ({
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
