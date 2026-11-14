// P2 Batch 2 (O32): anomaly alerts — RULE-BASED detection, computed
// live from the real tables. No stored rows, no ML model, no AI —
// just thresholds on the real data, and the page says so plainly.
//
// Four checks:
//   (a) win-rate — a player whose win rate in the last 7 days is above
//       80% with 20+ rounds (possible exploit or luck — the page says
//       "check, don't assume"). Win = payout > stake.
//   (b) stake-jump — a player's cash stakes in the last 7 days are 5×
//       or more their previous 7 days' stakes, and at least GH₵ 100
//       in the last 7 days (a 5× jump from GH₵ 1 to GH₵ 5 is noise,
//       not an anomaly — the page says the GH₵ 100 floor).
//   (c) rtp-spike — a game's actual RTP in the last 7 days is 10+
//       points above its base RTP with 50+ rounds (the same flag rule
//       as the RTP monitor, O17, scoped to the last 7 days).
//   (d) deposit-withdraw — a player who deposited GH₵ 1,000+ in the
//       last 24 hours AND withdrew within 1 hour of a deposit in that
//       window (fraud signals (c)+(e) combined into one anomaly).
import { prisma } from "./prisma";
import { dec, round2 } from "./money";
import { baseRtpFor } from "./rtp";
import { getGame } from "./games";

export type AnomalyType = "win-rate" | "stake-jump" | "rtp-spike" | "deposit-withdraw";

export interface Anomaly {
  id: string;
  type: AnomalyType;
  severity: "high" | "medium";
  userId: string | null;
  userName: string | null;
  game: string | null;
  gameName: string | null;
  reason: string;
  createdAt: string;
}

const DAY = 24 * 60 * 60 * 1000;

export async function computeAnomalies(): Promise<{ anomalies: Anomaly[]; counts: { high: number; medium: number } }> {
  const now = Date.now();
  const weekAgo = new Date(now - 7 * DAY);
  const prevWeekAgo = new Date(now - 14 * DAY);
  const dayAgo = new Date(now - DAY);

  const [weekRounds, prevWeekRounds, weekDeposits, dayDeposits, dayWithdrawals, users] = await Promise.all([
    prisma.gameResult.findMany({
      where: { createdAt: { gte: weekAgo } },
      select: { userId: true, game: true, currency: true, stake: true, payout: true },
    }),
    prisma.gameResult.findMany({
      where: { createdAt: { gte: prevWeekAgo, lt: weekAgo }, currency: "cash" },
      select: { userId: true, stake: true },
    }),
    prisma.depositEvent.findMany({
      where: { createdAt: { gte: weekAgo } },
      select: { userId: true, amount: true, createdAt: true },
    }),
    prisma.depositEvent.findMany({
      where: { createdAt: { gte: dayAgo } },
      select: { userId: true, amount: true, createdAt: true },
    }),
    prisma.withdrawal.findMany({
      where: { createdAt: { gte: dayAgo } },
      select: { userId: true, amount: true, createdAt: true },
    }),
    prisma.user.findMany({ select: { id: true, name: true, email: true, phone: true } }),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const anomalies: Anomaly[] = [];

  // (a) Win rate above 80% with 20+ rounds in the last 7 days.
  const roundsByUser = new Map<string, { rounds: number; wins: number }>();
  for (const r of weekRounds) {
    const row = roundsByUser.get(r.userId) ?? { rounds: 0, wins: 0 };
    row.rounds += 1;
    if (dec(r.payout) > dec(r.stake)) row.wins += 1;
    roundsByUser.set(r.userId, row);
  }
  for (const [userId, { rounds, wins }] of roundsByUser) {
    if (rounds < 20) continue;
    const rate = (wins / rounds) * 100;
    if (rate <= 80) continue;
    const u = userById.get(userId);
    if (!u) continue;
    anomalies.push({
      id: `winrate-${userId}`,
      type: "win-rate",
      severity: "medium",
      userId,
      userName: u.name,
      game: null,
      gameName: null,
      reason: `Won ${wins} of ${rounds} rounds in the last 7 days (${rate.toFixed(0)}% win rate). Check, don't assume — this can be luck, not an exploit.`,
      createdAt: new Date(now).toISOString(),
    });
  }

  // (b) Cash stakes jumped 5×+ vs the previous 7 days (min GH₵ 100 now).
  const stakeNow = new Map<string, number>();
  for (const r of weekRounds) {
    if (r.currency !== "cash") continue;
    stakeNow.set(r.userId, round2((stakeNow.get(r.userId) ?? 0) + dec(r.stake)));
  }
  const stakePrev = new Map<string, number>();
  for (const r of prevWeekRounds) {
    stakePrev.set(r.userId, round2((stakePrev.get(r.userId) ?? 0) + dec(r.stake)));
  }
  for (const [userId, current] of stakeNow) {
    if (current < 100) continue;
    const prev = stakePrev.get(userId) ?? 0;
    if (prev <= 0) continue;
    const mult = current / prev;
    if (mult < 5) continue;
    const u = userById.get(userId);
    if (!u) continue;
    anomalies.push({
      id: `jump-${userId}`,
      type: "stake-jump",
      severity: "high",
      userId,
      userName: u.name,
      game: null,
      gameName: null,
      reason: `Staked GH₵ ${current.toFixed(2)} in the last 7 days — ${mult.toFixed(1)}× their previous 7 days (GH₵ ${prev.toFixed(2)}). Possible account takeover or a big deposit.`,
      createdAt: new Date(now).toISOString(),
    });
  }

  // (c) A game's actual RTP in the last 7 days is 10+ points above its
  // base with 50+ rounds (the RTP monitor's flag rule, 7-day scoped).
  const byGame = new Map<string, { rounds: number; stakes: number; payouts: number }>();
  for (const r of weekRounds) {
    const row = byGame.get(r.game) ?? { rounds: 0, stakes: 0, payouts: 0 };
    row.rounds += 1;
    row.stakes = round2(row.stakes + dec(r.stake));
    row.payouts = round2(row.payouts + dec(r.payout));
    byGame.set(r.game, row);
  }
  for (const [slug, g] of byGame) {
    if (g.rounds < 50 || g.stakes <= 0) continue;
    const base = baseRtpFor(slug);
    if (base === null) continue;
    const actual = round2((g.payouts / g.stakes) * 100);
    if (actual <= base + 10) continue;
    anomalies.push({
      id: `rtp-${slug}`,
      type: "rtp-spike",
      severity: "high",
      userId: null,
      userName: null,
      game: slug,
      gameName: getGame(slug)?.name ?? slug,
      reason: `${getGame(slug)?.name ?? slug} paid ${actual.toFixed(1)}% RTP in the last 7 days (base ${base.toFixed(1)}%) over ${g.rounds} rounds — ${round2(actual - base).toFixed(1)} points over.`,
      createdAt: new Date(now).toISOString(),
    });
  }

  // (d) GH₵ 1,000+ deposited in 24h AND a withdrawal within 1 hour of
  // a deposit in the same window.
  const dep24 = new Map<string, { total: number; times: Date[] }>();
  for (const d of dayDeposits) {
    const row = dep24.get(d.userId) ?? { total: 0, times: [] };
    row.total = round2(row.total + dec(d.amount));
    row.times.push(d.createdAt);
    dep24.set(d.userId, row);
  }
  for (const w of dayWithdrawals) {
    const dep = dep24.get(w.userId);
    if (!dep || dep.total < 1000) continue;
    const hit = dep.times.find((t) => {
      const gap = w.createdAt.getTime() - t.getTime();
      return gap >= 0 && gap <= 60 * 60 * 1000;
    });
    if (!hit) continue;
    const u = userById.get(w.userId);
    if (!u) continue;
    anomalies.push({
      id: `depwd-${w.userId}`,
      type: "deposit-withdraw",
      severity: "high",
      userId: w.userId,
      userName: u.name,
      game: null,
      gameName: null,
      reason: `Deposited GH₵ ${dep.total.toFixed(2)} in the last 24 hours and requested a GH₵ ${dec(w.amount).toFixed(2)} withdrawal within 1 hour of a deposit.`,
      createdAt: w.createdAt.toISOString(),
    });
  }

  const rank = (s: "high" | "medium") => (s === "high" ? 0 : 1);
  anomalies.sort((a, b) => rank(a.severity) - rank(b.severity) || b.createdAt.localeCompare(a.createdAt));
  return {
    anomalies,
    counts: {
      high: anomalies.filter((a) => a.severity === "high").length,
      medium: anomalies.filter((a) => a.severity === "medium").length,
    },
  };
}
