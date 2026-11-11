import { prisma } from "./prisma";
import { dateStr, todayStr } from "./money";

export interface AchievementDef {
  key: string;
  name: string;
  target: number;
}

/** v48 achievement chips: First win / 3-win streak / 10 games played / First cash-out. */
export const ACHIEVEMENTS: AchievementDef[] = [
  { key: "first-win", name: "First Win", target: 1 },
  { key: "streak-3", name: "3-Win Streak", target: 3 },
  { key: "games-10", name: "10 Games Played", target: 10 },
  { key: "first-cashout", name: "First Cash-Out", target: 1 },
];

/** Consecutive claim days ending today (or yesterday if today is unclaimed). */
export async function currentStreak(userId: string): Promise<number> {
  const claims = await prisma.dailyClaim.findMany({
    where: { userId },
    select: { claimedDate: true },
    orderBy: { claimedDate: "desc" },
  });
  const days = new Set(claims.map((c) => c.claimedDate));
  let streak = 0;
  const d = new Date(`${todayStr()}T00:00:00.000Z`);
  if (!days.has(dateStr(d))) d.setUTCDate(d.getUTCDate() - 1); // not claimed today yet
  while (days.has(dateStr(d))) {
    streak += 1;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return streak;
}
