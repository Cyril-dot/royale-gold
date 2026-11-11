import crypto from "node:crypto";

/**
 * Trivia round tokens — v1 in-memory store.
 * GET /api/games/trivia/questions deals 10 random questions and returns a
 * roundToken; the answers stay server-side until graded. Tokens expire
 * after 30 minutes. A restart loses open rounds (the 5-coin entry is only
 * debited at grading time, so no coins are lost).
 */

export interface TriviaRound {
  token: string;
  userId: string;
  questionIds: string[];
  answers: number[]; // answerIndex per question
  createdAt: number;
}

const rounds = new Map<string, TriviaRound>();

export function createTriviaRound(
  userId: string,
  questionIds: string[],
  answers: number[],
): TriviaRound {
  const round: TriviaRound = {
    token: crypto.randomUUID(),
    userId,
    questionIds,
    answers,
    createdAt: Date.now(),
  };
  rounds.set(round.token, round);
  for (const [t, r] of rounds) {
    if (Date.now() - r.createdAt > 30 * 60 * 1000) rounds.delete(t);
  }
  return round;
}

export function consumeTriviaRound(token: string, userId: string): TriviaRound | null {
  const round = rounds.get(token);
  if (!round || round.userId !== userId) return null;
  rounds.delete(token);
  return round;
}

/** Trivia payout rule (v48): entry 5 coins; 7 correct → 10, 9 → 15, 10 → 25. */
export function triviaPayout(correct: number): number {
  if (correct >= 10) return 25;
  if (correct >= 9) return 15;
  if (correct >= 7) return 10;
  return 0;
}
