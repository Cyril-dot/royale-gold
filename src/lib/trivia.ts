import crypto from "node:crypto";

/**
 * Trivia round tokens — v1 in-memory store.
 * GET /api/games/trivia/questions deals N random questions from the
 * chosen difficulty pool and returns a roundToken; the answers stay
 * server-side until graded. Tokens expire after 30 minutes. A restart
 * loses open rounds (the 5-coin entry is only debited at grading time,
 * so no coins are lost).
 *
 * Difficulty (Nov 2026): the player picks easy / medium / hard before
 * the round. The pool is the questions classified at that difficulty in
 * the seed bank (easy 22, medium 15, hard 15), and the clock follows
 * the difficulty: easy 20s, medium 15s, hard 10s per question.
 *
 * Reward per answer (Nov 2026): every correct answer is worth 1 coin,
 * banked as the game goes on (POST /api/games/trivia/answer) and paid
 * at grading. The milestone table still applies — the final payout is
 * max(per-answer coins, milestone), so a perfect game still pays 25
 * and 70%/90% still pay 10/15, exactly as before. The only change vs
 * the old table: below the 70% milestone a round now pays its
 * per-answer coins (1-6) instead of 0.
 */

export type TriviaDifficulty = "easy" | "medium" | "hard";

export const TRIVIA_DIFFICULTIES: Record<
  TriviaDifficulty,
  { label: string; timePerQ: number; blurb: string }
> = {
  easy: { label: "Easy", timePerQ: 20, blurb: "The gentlest questions · 20s each" },
  medium: { label: "Medium", timePerQ: 15, blurb: "A mix of everything · 15s each" },
  hard: { label: "Hard", timePerQ: 10, blurb: "The toughest questions · 10s each" },
};

export function parseDifficulty(v: string | null): TriviaDifficulty {
  return v === "easy" || v === "medium" || v === "hard" ? v : "medium";
}

export interface TriviaRound {
  token: string;
  userId: string;
  questionIds: string[];
  answers: number[]; // answerIndex per question
  difficulty: TriviaDifficulty;
  total: number;
  timePerQ: number;
  /** Answers recorded as the player plays, in order; null = not answered yet. */
  recorded: (number | null)[];
  /** Per-answer reward banked so far (1 coin per correct answer). */
  earned: number;
  createdAt: number;
}

const rounds = new Map<string, TriviaRound>();

export function createTriviaRound(
  userId: string,
  questionIds: string[],
  answers: number[],
  difficulty: TriviaDifficulty,
  timePerQ: number,
): TriviaRound {
  const round: TriviaRound = {
    token: crypto.randomUUID(),
    userId,
    questionIds,
    answers,
    difficulty,
    total: questionIds.length,
    timePerQ,
    recorded: questionIds.map(() => null),
    earned: 0,
    createdAt: Date.now(),
  };
  rounds.set(round.token, round);
  for (const [t, r] of rounds) {
    if (Date.now() - r.createdAt > 30 * 60 * 1000) rounds.delete(t);
  }
  return round;
}

export function getTriviaRound(token: string, userId: string): TriviaRound | null {
  const round = rounds.get(token);
  if (!round || round.userId !== userId) return null;
  return round;
}

export function consumeTriviaRound(token: string, userId: string): TriviaRound | null {
  const round = rounds.get(token);
  if (!round || round.userId !== userId) return null;
  rounds.delete(token);
  return round;
}

/**
 * Grade one answer as the player plays. Questions must be answered in
 * order — answering a later question early would leak the answer key,
 * so an out-of-order or repeat answer returns null (route 400s).
 * choice -1 = timed out (counts as wrong).
 */
export function answerTriviaQuestion(
  round: TriviaRound,
  index: number,
  choice: number,
): { correct: boolean; earned: number; correctIndex: number } | null {
  const next = round.recorded.findIndex((a) => a === null);
  if (next === -1 || index !== next) return null;
  if (choice !== -1 && (choice < 0 || choice > 3)) return null;
  round.recorded[index] = choice;
  const correct = choice === round.answers[index];
  if (correct) round.earned += 1;
  return { correct, earned: round.earned, correctIndex: round.answers[index] };
}

/** Milestone table (v48), generalised to any round size by percentage. */
export function triviaPayout(correct: number, total: number): number {
  if (total <= 0) return 0;
  if (correct >= total) return 25;
  const ratio = correct / total;
  if (ratio >= 0.9) return 15;
  if (ratio >= 0.7) return 10;
  return 0;
}

/**
 * Final payout: the per-answer coins (1 per correct answer), topped up
 * to the milestone if the milestone is higher. 10/10 -> 25, 9/10 -> 15,
 * 7/10 -> 10, exactly as before; 1-6/10 now pays 1-6 instead of 0.
 */
export function triviaFinalPayout(correct: number, total: number): number {
  return Math.max(correct, triviaPayout(correct, total));
}
