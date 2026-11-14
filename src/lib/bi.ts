// P2 Batch 2 (O26): advanced BI & cohorts — players grouped by the
// month they joined (cohort = YYYY-MM), with a retention curve per
// cohort. Every figure comes from the real tables (User.createdAt,
// GameResult, DepositEvent) — no separate analytics store, nothing
// invented.
//
// Active = played at least one round in the last 30 days. Retention
// month N = the % of the cohort who played at least one round in the
// Nth calendar month after joining (month 1 = the joining month
// itself, so it is always 100% for cohorts with any play — it is
// shown anyway, so the curve reads honestly from the start).
import { prisma } from "./prisma";
import { dec, round2 } from "./money";

export interface CohortRow {
  cohort: string; // "YYYY-MM"
  players: number;
  activePct: number; // % played in the last 30 days
  totalDeposited: number;
  totalStaked: number;
  ggr: number; // cash stakes − cash payouts (coins excluded — GH₵ only)
  avgDeposit: number; // total deposited / players
  retention: { m1: number | null; m2: number | null; m3: number | null }; // % played in month 1/2/3 after joining; null = that month has not happened yet
}

const DAY = 24 * 60 * 60 * 1000;

/** Calendar month key "YYYY-MM" (UTC) for a date. */
function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

/** First day of the month N months after the given "YYYY-MM". */
function monthStart(cohort: string, offset: number): Date {
  const [y, m] = cohort.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + offset, 1));
}

export async function cohortReport(): Promise<{ cohorts: CohortRow[]; totalPlayers: number }> {
  const now = Date.now();
  const activeSince = new Date(now - 30 * DAY);
  const [users, deposits, rounds] = await Promise.all([
    prisma.user.findMany({
      where: { role: "user" },
      select: { id: true, createdAt: true },
    }),
    prisma.depositEvent.findMany({ select: { userId: true, amount: true } }),
    prisma.gameResult.findMany({
      where: { currency: "cash" },
      select: { userId: true, stake: true, payout: true, createdAt: true },
    }),
  ]);

  const depByUser = new Map<string, number>();
  for (const d of deposits) depByUser.set(d.userId, round2((depByUser.get(d.userId) ?? 0) + dec(d.amount)));
  const stakeByUser = new Map<string, number>();
  const ggrByUser = new Map<string, number>();
  const playedMonthsByUser = new Map<string, Set<string>>();
  const playedRecent = new Set<string>();
  for (const r of rounds) {
    stakeByUser.set(r.userId, round2((stakeByUser.get(r.userId) ?? 0) + dec(r.stake)));
    ggrByUser.set(r.userId, round2((ggrByUser.get(r.userId) ?? 0) + dec(r.stake) - dec(r.payout)));
    const months = playedMonthsByUser.get(r.userId) ?? new Set<string>();
    months.add(monthKey(new Date(r.createdAt)));
    playedMonthsByUser.set(r.userId, months);
    if (r.createdAt.getTime() >= activeSince.getTime()) playedRecent.add(r.userId);
  }

  const cohortOf = new Map<string, string>();
  for (const u of users) cohortOf.set(u.id, monthKey(new Date(u.createdAt)));

  const cohorts = new Map<string, { players: string[] }>();
  for (const u of users) {
    const key = cohortOf.get(u.id)!;
    const row = cohorts.get(key) ?? { players: [] };
    row.players.push(u.id);
    cohorts.set(key, row);
  }

  const out: CohortRow[] = [...cohorts.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([cohort, { players }]) => {
      const totalDeposited = round2(players.reduce((s, id) => s + (depByUser.get(id) ?? 0), 0));
      const totalStaked = round2(players.reduce((s, id) => s + (stakeByUser.get(id) ?? 0), 0));
      const ggr = round2(players.reduce((s, id) => s + (ggrByUser.get(id) ?? 0), 0));
      const active = players.filter((id) => playedRecent.has(id)).length;
      const retentionFor = (offset: number): number | null => {
        const start = monthStart(cohort, offset);
        // A month that has not started yet has no data — null, not 0,
        // so the curve never reads a future month as churn.
        if (start.getTime() > now) return null;
        const key = start.toISOString().slice(0, 7);
        const played = players.filter((id) => (playedMonthsByUser.get(id) ?? new Set()).has(key)).length;
        return players.length === 0 ? 0 : Math.round((played / players.length) * 100);
      };
      const r1 = retentionFor(0);
      const r2 = retentionFor(1);
      const r3 = retentionFor(2);
      return {
        cohort,
        players: players.length,
        activePct: players.length === 0 ? 0 : Math.round((active / players.length) * 100),
        totalDeposited,
        totalStaked,
        ggr,
        avgDeposit: players.length === 0 ? 0 : round2(totalDeposited / players.length),
        retention: { m1: r1, m2: r2, m3: r3 },
      };
    });
  return { cohorts: out, totalPlayers: users.length };
}
