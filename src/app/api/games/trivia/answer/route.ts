import { requireAuth } from "@/lib/auth";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { answerTriviaQuestion, getTriviaRound } from "@/lib/trivia";

/**
 * Grade one answer as the player plays. The client posts the pick and
 * gets back right/wrong + the correct option for THAT question only —
 * the key for unanswered questions never leaves the server, and
 * questions must be answered in order, so the key cannot be probed
 * early. choice -1 = timed out.
 */
export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await readJson<{ roundToken?: string; index?: number; choice?: number }>(req);
    if (!body?.roundToken || typeof body.index !== "number" || typeof body.choice !== "number") {
      return fail("roundToken, index and choice are required");
    }
    const round = getTriviaRound(body.roundToken, user.id);
    if (!round) return fail("Invalid or expired round token", 400);
    const graded = answerTriviaQuestion(round, body.index, body.choice);
    if (!graded) return fail("That question is already answered or out of order", 400);
    return ok(graded);
  } catch (err) {
    return toErrorResponse(err);
  }
}
