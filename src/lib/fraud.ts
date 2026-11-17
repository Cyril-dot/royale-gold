// P1 Batch 2 (A24): fraud alerts — REAL signals, computed live from
// the tables, no stored alert rows. An admin sees only their own
// downline; the owner sees everything (or one admin's downline in
// preview). Each alert carries a severity, the player, and the reason.
//
// Signals (all defined exactly, so an alert can be checked against
// the DB by hand):
//   (a) withdrawal-flags — a PENDING or ADMIN_APPROVED withdrawal
//       carrying 2+ risk flags (A15) → HIGH.
//   (b) rapid-withdrawals — a player with 3+ withdrawal requests in
//       the last 24 hours → HIGH.
//   (c) deposit-no-play — a player who deposited 1,000+ (in their
//       fiat — the GHS threshold scaled by conversionRate/5) in the
//       last 24 hours and played 0 rounds in the last 24 hours
//       (deposit-then-withdraw pattern) → MEDIUM.
//   (e) deposit-then-withdraw — a withdrawal requested within 1 hour
//       of a deposit by the same player (last 7 days) → MEDIUM.
//
// Phase 1 country-based (Nov 2026): amounts in the alert reasons use
// the player's own symbol; the 1,000 deposit-no-play threshold is
// stored in GHS terms and scaled per player (NGN: ₦100,000).

import { prisma } from "./prisma";
import { dec } from "./money";
import { annotateWithdrawalFlags, WITHDRAWAL_RISK_LABELS } from "./withdrawals";
import { symbolFor } from "./country";
import { getAllCurrencyConfigs } from "./game-config";

export type FraudSeverity = "high" | "medium";
export type FraudSignal = "withdrawal-flags" | "rapid-withdrawals" | "deposit-no-play" | "deposit-then-withdraw";

export interface FraudAlert {
  id: string;
  severity: FraudSeverity;
  signal: FraudSignal;
  userId: string;
  userName: string;
  userContact: string | null;
  reason: string;
  createdAt: string;
}

const DAY = 24 * 60 * 60 * 1000;

export async function computeFraudAlerts(userIds: string[]): Promise<FraudAlert[]> {
  if (userIds.length === 0) return [];
  const now = Date.now();
  const dayAgo = new Date(now - DAY);
  const weekAgo = new Date(now - 7 * DAY);
  const monthAgo = new Date(now - 30 * DAY);

  const [openWithdrawals, recentWithdrawals, recentDeposits, recentRounds, weekDeposits, weekWithdrawals, users, configs] = await Promise.all([
    // (a) open withdrawals (last 30 days) with their players.
    prisma.withdrawal.findMany({
      where: { userId: { in: userIds }, status: { in: ["pending", "admin_approved"] }, createdAt: { gte: monthAgo } },
      // Select only the columns the signals map: an unfiltered select
      // also pulls newer columns (accountType/accountName/accountDetail)
      // that prod may not have yet, and the whole query throws.
      // (Prisma takes either select or include — the relation lives
      // inside select here.)
      select: { id: true, userId: true, amount: true, method: true, createdAt: true, user: { select: { id: true, name: true, email: true, phone: true, createdAt: true, currency: true } } },
      orderBy: { createdAt: "desc" },
    }),
    // (b) every withdrawal request in the last 24 hours.
    prisma.withdrawal.findMany({
      where: { userId: { in: userIds }, createdAt: { gte: dayAgo } },
      select: { userId: true },
    }),
    // (c) deposits in the last 24 hours.
    prisma.depositEvent.findMany({
      where: { userId: { in: userIds }, createdAt: { gte: dayAgo } },
      select: { userId: true, amount: true },
    }),
    // (c) rounds played in the last 24 hours.
    prisma.gameResult.findMany({
      where: { userId: { in: userIds }, createdAt: { gte: dayAgo } },
      select: { userId: true },
    }),
    // (e) deposits in the last 7 days.
    prisma.depositEvent.findMany({
      where: { userId: { in: userIds }, createdAt: { gte: weekAgo } },
      select: { userId: true, createdAt: true, amount: true },
      orderBy: { createdAt: "asc" },
    }),
    // (e) withdrawals in the last 7 days.
    prisma.withdrawal.findMany({
      where: { userId: { in: userIds }, createdAt: { gte: weekAgo } },
      select: { id: true, userId: true, amount: true, method: true, createdAt: true, user: { select: { id: true, name: true, email: true, phone: true, currency: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true, phone: true, currency: true },
    }),
    getAllCurrencyConfigs(),
  ]);

  const userById = new Map(users.map((u) => [u.id, u]));
  // Phase 1 country-based (Nov 2026): per-player threshold factor.
  const factorOf = (userId: string): number => {
    const fiat = userById.get(userId)?.currency ?? "GHS";
    const cfg = configs.find((c) => c.currency === fiat);
    return (cfg?.conversionRate ?? 5) / 5;
  };
  const alerts: FraudAlert[] = [];

  // (a) A withdrawal with 2+ risk flags is HIGH — the flags are the
  // same A15 computation as the Money queue.
  const flags = await annotateWithdrawalFlags(
    openWithdrawals.map((w) => ({ id: w.id, userId: w.userId, amount: dec(w.amount), user: w.user })),
  );
  for (const w of openWithdrawals) {
    const f = flags.get(w.id) ?? [];
    if (f.length >= 2) {
      alerts.push({
        id: `flags-${w.id}`,
        severity: "high",
        signal: "withdrawal-flags",
        userId: w.userId,
        userName: w.user.name,
        userContact: w.user.email ?? w.user.phone ?? null,
        reason: `Withdrawal of ${symbolFor(w.user.currency)} ${dec(w.amount).toFixed(2)} (${w.method}) carries ${f.length} risk flags: ${f.map((x) => WITHDRAWAL_RISK_LABELS[x]).join(", ")}.`,
        createdAt: w.createdAt.toISOString(),
      });
    }
  }

  // (b) 3+ withdrawal requests in 24h is HIGH.
  const reqCount = new Map<string, number>();
  for (const w of recentWithdrawals) reqCount.set(w.userId, (reqCount.get(w.userId) ?? 0) + 1);
  for (const [userId, n] of reqCount) {
    if (n >= 3) {
      const u = userById.get(userId);
      if (!u) continue;
      alerts.push({
        id: `rapid-${userId}`,
        severity: "high",
        signal: "rapid-withdrawals",
        userId,
        userName: u.name,
        userContact: u.email ?? u.phone ?? null,
        reason: `${n} withdrawal requests in the last 24 hours.`,
        createdAt: new Date(now).toISOString(),
      });
    }
  }

  // (c) 1,000+ (in the player's fiat) deposited in 24h with 0 rounds played in 24h.
  const dep24 = new Map<string, number>();
  for (const d of recentDeposits) dep24.set(d.userId, (dep24.get(d.userId) ?? 0) + dec(d.amount));
  const played24 = new Set(recentRounds.map((r) => r.userId));
  for (const [userId, total] of dep24) {
    if (total >= 1000 * factorOf(userId) && !played24.has(userId)) {
      const u = userById.get(userId);
      if (!u) continue;
      alerts.push({
        id: `noplay-${userId}`,
        severity: "medium",
        signal: "deposit-no-play",
        userId,
        userName: u.name,
        userContact: u.email ?? u.phone ?? null,
        reason: `Deposited ${symbolFor(u.currency)} ${total.toFixed(2)} in the last 24 hours and played no rounds in the last 24 hours.`,
        createdAt: new Date(now).toISOString(),
      });
    }
  }

  // (e) A withdrawal within 1 hour of a deposit by the same player.
  const depositsByUser = new Map<string, { createdAt: Date; amount: number }[]>();
  for (const d of weekDeposits) {
    const list = depositsByUser.get(d.userId) ?? [];
    list.push({ createdAt: d.createdAt, amount: dec(d.amount) });
    depositsByUser.set(d.userId, list);
  }
  for (const w of weekWithdrawals) {
    const deps = depositsByUser.get(w.userId) ?? [];
    const hit = deps.find((d) => {
      const gap = w.createdAt.getTime() - d.createdAt.getTime();
      return gap >= 0 && gap <= 60 * 60 * 1000;
    });
    if (hit) {
      alerts.push({
        id: `quick-${w.id}`,
        severity: "medium",
        signal: "deposit-then-withdraw",
        userId: w.userId,
        userName: w.user.name,
        userContact: w.user.email ?? w.user.phone ?? null,
        reason: `Requested a ${symbolFor(w.user.currency)} ${dec(w.amount).toFixed(2)} withdrawal ${Math.max(0, Math.round((w.createdAt.getTime() - hit.createdAt.getTime()) / 60000))} minutes after depositing ${symbolFor(w.user.currency)} ${hit.amount.toFixed(2)}.`,
        createdAt: w.createdAt.toISOString(),
      });
    }
  }

  // High first, then newest.
  const rank = (s: FraudSeverity) => (s === "high" ? 0 : 1);
  alerts.sort((a, b) => rank(a.severity) - rank(b.severity) || b.createdAt.localeCompare(a.createdAt));
  return alerts;
}

// P1 Batch 3 (O18): the OWNER's global fraud console — the same 4
// signals (a/b/c/e), computed over EVERY player, with per-admin
// rollups (which admin's downline carries the most high-severity
// alerts). The signal logic is NOT duplicated: it reuses
// computeFraudAlerts above. Signal (d) is still not built (see the
// note at the top of this file).
export interface OwnerFraudRollup {
  adminId: string | null;
  adminName: string;
  high: number;
  medium: number;
  total: number;
}

export async function computeOwnerFraud(): Promise<{
  alerts: FraudAlert[];
  counts: { high: number; medium: number };
  byAdmin: OwnerFraudRollup[];
}> {
  const [allUsers, admins] = await Promise.all([
    prisma.user.findMany({ select: { id: true, referredByAdminId: true } }),
    prisma.user.findMany({ where: { role: "admin" }, select: { id: true, name: true } }),
  ]);
  const alerts = await computeFraudAlerts(allUsers.map((u) => u.id));
  const adminName = new Map(admins.map((a) => [a.id, a.name]));
  const refByUser = new Map(allUsers.map((u) => [u.id, u.referredByAdminId]));
  const rollup = new Map<string | null, OwnerFraudRollup>();
  const touch = (adminId: string | null) => {
    let row = rollup.get(adminId);
    if (!row) {
      row = {
        adminId,
        adminName: adminId === null ? "No referring admin" : (adminName.get(adminId) ?? "Unknown admin"),
        high: 0,
        medium: 0,
        total: 0,
      };
      rollup.set(adminId, row);
    }
    return row;
  };
  for (const a of alerts) {
    const row = touch(refByUser.get(a.userId) ?? null);
    row.total += 1;
    if (a.severity === "high") row.high += 1;
    else row.medium += 1;
  }
  // Every admin appears, even with zero alerts — the owner sees the
  // whole downline picture, not only the admins with problems.
  for (const a of admins) touch(a.id);
  touch(null);
  const byAdmin = [...rollup.values()].sort((a, b) => b.high - a.high || b.total - a.total);
  return {
    alerts,
    counts: {
      high: alerts.filter((a) => a.severity === "high").length,
      medium: alerts.filter((a) => a.severity === "medium").length,
    },
    byAdmin,
  };
}
