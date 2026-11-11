import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/http";
import { createTriviaRound } from "@/lib/trivia";

/** Deal 10 random questions (without answers) and return a round token. */
export async function GET() {
  try {
    const user = await requireAuth();
    const all = await prisma.triviaQuestion.findMany({
      select: { id: true, question: true, options: true, answerIndex: true, category: true },
    });
    if (all.length < 10) {
      return ok({ error: "Trivia bank not seeded yet" }, 503);
    }
    const shuffled = [...all].sort(() => Math.random() - 0.5).slice(0, 10);
    const round = createTriviaRound(
      user.id,
      shuffled.map((q) => q.id),
      shuffled.map((q) => q.answerIndex),
    );
    return ok({
      roundToken: round.token,
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
