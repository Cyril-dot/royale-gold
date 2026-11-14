// Commission — P0 Batch 3 (O4) rules engine.
//
// THE MODEL CHANGED (flat-%-of-deposit -> rules engine): commission is no
// longer a flat % of each deposit. The owner sets a rule per admin (or one
// global default): model "revshare" = % of the player's NET LOSS (stakes
// - payouts) or "turnover" = % of total stakes. The rate in force on a
// day (latest rule with effectiveFrom <= that day) is what that day pays
// — the frozen-per-deposit-day rule STAYS, now at rule granularity. A day
// with no rule at all falls back to the LEGACY model: the stamped
// DepositEvent.commission (flat % of deposit, the pre-Batch-3 behaviour).
//
// Every figure on every commission page, the rollup, and the P&L is
// RECOMPUTED from the same ledger (DepositEvent + GameResult) by the
// functions below, so the numbers cannot disagree. The deposit route
// stamps pctInForce = the effective rule rate and commission = 0 when a
// rule is in force (commission is earned on activity, not on the deposit
// itself); in legacy mode it stamps the old flat % and the old commission.

import { prisma } from "./prisma";
import { dateStr, dec, round2, todayStr, yesterdayStr } from "./money";

export type CommissionModel = "revshare" | "turnover";

export interface CommissionRuleRow {
  id: string;
  adminId: string | null;
  adminName: string | null;
  model: CommissionModel;
  rate: number;
  // P1 Batch 4 (O24): the parent-share % on this rule.
  parentSharePct: number;
  effectiveFrom: string;
  createdAt: string;
}

export interface CommissionDay {
  date: string;
  deposits: number;
  totalAmount: number;
  totalStakes: number;
  totalPayouts: number;
  totalCommission: number;
  model: CommissionModel | "legacy" | "mixed";
  rate: number;
  // P1 Batch 4 (O24): the parent-share % in force on this day (0 when
  // the admin has no parent, or the rule sets no split). The parent's
  // share of this day's commission is totalCommission × pct / 100 — a
  // REPORTING line only, never deducted from the child's payout.
  parentSharePct: number;
}

export interface CommissionSummary {
  today: number;
  yesterday: number;
  last7d: number;
  last30d: number;
  allTime: number;
}

export interface DepositRow {
  id: string;
  userId: string;
  userName: string;
  userContact: string | null;
  amount: number;
  method: string;
  pctInForce: number;
  commission: number;
  time: string;
}

function dayBounds(date: string): { from: Date; to: Date } {
  const from = new Date(date + "T00:00:00Z");
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  return { from, to };
}

function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return dateStr(d);
}

/** All user ids referred by this admin. */
export async function referredUserIds(adminId: string): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { referredByAdminId: adminId },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

export interface RuleTimelineEntry {
  adminId: string | null;
  model: CommissionModel;
  rate: number;
  // P1 Batch 4 (O24): the parent-share % on this rule.
  parentSharePct: number;
  effectiveFrom: Date;
}

/** The rule timeline for an admin (their own rules + the global default),
 * oldest first. A rule applies from its effectiveFrom date. */
async function ruleTimeline(adminId: string): Promise<RuleTimelineEntry[]> {
  const rules = await prisma.commissionRule.findMany({
    where: { OR: [{ adminId }, { adminId: null }] },
    orderBy: { effectiveFrom: "asc" },
  });
  return rules.map((r) => ({
    adminId: r.adminId,
    model: (r.model === "turnover" ? "turnover" : "revshare") as CommissionModel,
    rate: dec(r.rate),
    parentSharePct: dec(r.parentSharePct),
    effectiveFrom: new Date(r.effectiveFrom),
  }));
}

/**
 * The rule in force on a day: the admin's own latest rule with
 * effectiveFrom <= that day, else the global default's latest rule with
 * effectiveFrom <= that day, else null (legacy model).
 */
export function ruleForDay(timeline: RuleTimelineEntry[], date: string): RuleTimelineEntry | null {
  const dayStart = new Date(date + "T00:00:00Z").getTime();
  let adminRule: RuleTimelineEntry | null = null;
  let globalRule: RuleTimelineEntry | null = null;
  for (const r of timeline) {
    if (r.effectiveFrom.getTime() > dayStart) continue;
    if (r.adminId) adminRule = r;
    else globalRule = r;
  }
  return adminRule ?? globalRule ?? null;
}

/**
 * Recompute every commission day for an admin from the ledger. Returns
 * one row per day with any activity (deposits or cash play), newest
 * first. `from`/`to` bound the days returned (inclusive, YYYY-MM-DD).
 */
export async function dayCommissions(
  adminId: string,
  from?: string,
  to?: string,
): Promise<CommissionDay[]> {
  const userIds = await referredUserIds(adminId);
  const timeline = await ruleTimeline(adminId);
  const endDate = to ?? todayStr();
  const startDate = from ?? "2020-01-01";
  const { from: fromDate } = dayBounds(startDate);
  const { to: toDate } = dayBounds(endDate);

  const [results, deposits] = await Promise.all([
    userIds.length === 0
      ? []
      : prisma.gameResult.findMany({
          where: { userId: { in: userIds }, currency: "cash", createdAt: { gte: fromDate, lt: toDate } },
          select: { stake: true, payout: true, createdAt: true },
        }),
    prisma.depositEvent.findMany({
      where: { adminId, createdAt: { gte: fromDate, lt: toDate } },
      select: { amount: true, commission: true, createdAt: true },
    }),
  ]);

  const byDay = new Map<
    string,
    { deposits: number; totalAmount: number; totalStakes: number; totalPayouts: number; legacyCommission: number }
  >();
  const touch = (date: string) => {
    let row = byDay.get(date);
    if (!row) {
      row = { deposits: 0, totalAmount: 0, totalStakes: 0, totalPayouts: 0, legacyCommission: 0 };
      byDay.set(date, row);
    }
    return row;
  };
  for (const d of deposits) {
    const row = touch(dateStr(new Date(d.createdAt)));
    row.deposits += 1;
    row.totalAmount = round2(row.totalAmount + dec(d.amount));
    row.legacyCommission = round2(row.legacyCommission + dec(d.commission));
  }
  for (const r of results) {
    const row = touch(dateStr(new Date(r.createdAt)));
    row.totalStakes = round2(row.totalStakes + dec(r.stake));
    row.totalPayouts = round2(row.totalPayouts + dec(r.payout));
  }

  const days: CommissionDay[] = [];
  for (const [date, row] of [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))) {
    const rule = ruleForDay(timeline, date);
    let totalCommission: number;
    let model: CommissionModel | "legacy";
    let rate: number;
    if (!rule) {
      totalCommission = row.legacyCommission;
      model = "legacy";
      rate = 0;
    } else if (rule.model === "revshare") {
      totalCommission = round2(Math.max(0, row.totalStakes - row.totalPayouts) * (rule.rate / 100));
      model = "revshare";
      rate = rule.rate;
    } else {
      totalCommission = round2(row.totalStakes * (rule.rate / 100));
      model = "turnover";
      rate = rule.rate;
    }
    days.push({
      date,
      deposits: row.deposits,
      totalAmount: row.totalAmount,
      totalStakes: row.totalStakes,
      totalPayouts: row.totalPayouts,
      totalCommission,
      model,
      rate,
      parentSharePct: rule?.parentSharePct ?? 0,
    });
  }
  return days;
}

/** Serialize one DepositEvent with its depositor for day-detail responses.
 * The deposit ROWS keep their stamped commission (history), but the
 * TOTALS are recomputed by the rules engine — that is the figure the
 * commission pages show. */
export async function depositsForAdminOn(adminId: string, date: string) {
  const { from, to } = dayBounds(date);
  const rows = await prisma.depositEvent.findMany({
    where: { adminId, createdAt: { gte: from, lt: to } },
    include: { user: { select: { id: true, name: true, email: true, phone: true } } },
    orderBy: { createdAt: "desc" },
  });
  const deposits: DepositRow[] = rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.user.name,
    userContact: r.user.email ?? r.user.phone ?? null,
    amount: dec(r.amount),
    method: r.method,
    pctInForce: dec(r.pctInForce),
    commission: dec(r.commission),
    time: r.createdAt.toISOString(),
  }));
  const days = await dayCommissions(adminId, date, date);
  const d = days[0];
  const totals = {
    deposits: deposits.length,
    totalAmount: deposits.reduce((s, x) => round2(s + x.amount), 0),
    totalCommission: d?.totalCommission ?? 0,
    totalStakes: d?.totalStakes ?? 0,
    totalPayouts: d?.totalPayouts ?? 0,
    model: d?.model ?? ("legacy" as const),
    rate: d?.rate ?? 0,
  };
  return { date, deposits, totals };
}

/** Today / Yesterday / 7d / 30d / all-time commission for one admin —
 * all recomputed from the ledger by the rules engine. */
export async function commissionSummary(adminId: string): Promise<CommissionSummary> {
  const days = await dayCommissions(adminId);
  const today = todayStr();
  const yesterday = yesterdayStr();
  const d7 = addDays(today, -6);
  const d30 = addDays(today, -29);
  const sum = (pred: (d: CommissionDay) => boolean) =>
    round2(days.filter(pred).reduce((acc, d) => acc + d.totalCommission, 0));
  return {
    today: sum((d) => d.date === today),
    yesterday: sum((d) => d.date === yesterday),
    last7d: sum((d) => d.date >= d7 && d.date <= today),
    last30d: sum((d) => d.date >= d30 && d.date <= today),
    allTime: sum(() => true),
  };
}

/** Every day on which the admin earned commission, newest first. */
export async function commissionHistoryDays(adminId: string) {
  return dayCommissions(adminId);
}

/**
 * Commission owed to one admin over a period (inclusive dates). The
 * settlement (O5) and the P&L both read this — one source of truth.
 */
export async function commissionOwed(adminId: string, from: string, to: string): Promise<number> {
  const days = await dayCommissions(adminId, from, to);
  return round2(days.reduce((acc, d) => acc + d.totalCommission, 0));
}

/** Commission owed to ALL admins over a period (the P&L commission line). */
export async function totalCommissionOwed(from: string, to: string): Promise<number> {
  const admins = await prisma.user.findMany({ where: { role: "admin" }, select: { id: true } });
  let total = 0;
  for (const a of admins) total = round2(total + (await commissionOwed(a.id, from, to)));
  return total;
}

/** Amount already PAID to an admin (sum of CommissionPayout rows). */
export async function commissionPaid(adminId: string, from?: string, to?: string): Promise<number> {
  const where: { adminId: string; createdAt?: { gte: Date; lt: Date } } = { adminId };
  if (from && to) {
    const { from: fromDate } = dayBounds(from);
    const { to: toDate } = dayBounds(to);
    where.createdAt = { gte: fromDate, lt: toDate };
  }
  const rows = await prisma.commissionPayout.findMany({ where, select: { amount: true } });
  return round2(rows.reduce((acc, r) => acc + dec(r.amount), 0));
}

export interface PlayerCommission {
  total: number;
  model: CommissionModel | "legacy" | "mixed" | "none";
  rate: number;
}

/**
 * Commission earned on ONE player for one admin — the player-360 figure
 * (P0 Batch 4 A3). Same rules as dayCommissions, but per player: each
 * day the rule in force that day applies (revshare = % of that player's
 * net loss that day; turnover = % of that player's stakes that day); a
 * day with no rule falls back to that player's stamped deposit
 * commissions for the day. The model returned is the model of the most
 * recent active day ("mixed" when days disagree, "none" when the player
 * has no activity at all) — the UI says which one it is.
 */
export async function playerCommission(adminId: string, userId: string): Promise<PlayerCommission> {
  const timeline = await ruleTimeline(adminId);
  const [results, deposits] = await Promise.all([
    prisma.gameResult.findMany({
      where: { userId, currency: "cash" },
      select: { stake: true, payout: true, createdAt: true },
    }),
    prisma.depositEvent.findMany({
      where: { userId, adminId },
      select: { commission: true, createdAt: true },
    }),
  ]);
  const byDay = new Map<string, { stakes: number; payouts: number; legacy: number }>();
  const touch = (date: string) => {
    let row = byDay.get(date);
    if (!row) {
      row = { stakes: 0, payouts: 0, legacy: 0 };
      byDay.set(date, row);
    }
    return row;
  };
  for (const r of results) {
    const row = touch(dateStr(new Date(r.createdAt)));
    row.stakes = round2(row.stakes + dec(r.stake));
    row.payouts = round2(row.payouts + dec(r.payout));
  }
  for (const d of deposits) {
    const row = touch(dateStr(new Date(d.createdAt)));
    row.legacy = round2(row.legacy + dec(d.commission));
  }
  let total = 0;
  let lastModel: CommissionModel | "legacy" | "none" = "none";
  let lastRate = 0;
  let mixed = false;
  for (const date of [...byDay.keys()].sort()) {
    const row = byDay.get(date)!;
    const rule = ruleForDay(timeline, date);
    let dayCommission: number;
    let dayModel: CommissionModel | "legacy";
    let dayRate: number;
    if (!rule) {
      dayCommission = row.legacy;
      dayModel = "legacy";
      dayRate = 0;
    } else if (rule.model === "revshare") {
      dayCommission = round2(Math.max(0, row.stakes - row.payouts) * (rule.rate / 100));
      dayModel = "revshare";
      dayRate = rule.rate;
    } else {
      dayCommission = round2(row.stakes * (rule.rate / 100));
      dayModel = "turnover";
      dayRate = rule.rate;
    }
    total = round2(total + dayCommission);
    if (lastModel !== "none" && lastModel !== dayModel) mixed = true;
    lastModel = dayModel;
    lastRate = dayRate;
  }
  return {
    total,
    model: lastModel === "none" ? "none" : mixed ? "mixed" : lastModel,
    rate: lastRate,
  };
}

/** Settlement for one admin over a period: owed / paid / balance. */
export async function settlementForAdmin(adminId: string, from: string, to: string) {
  const owed = await commissionOwed(adminId, from, to);
  const paid = await commissionPaid(adminId, from, to);
  return { owed, paid, balance: round2(owed - paid) };
}

/** All commission rules (global default first, then per-admin, newest
 * first) for the owner rules UI. */
export async function listCommissionRules(): Promise<CommissionRuleRow[]> {
  const rules = await prisma.commissionRule.findMany({
    orderBy: [{ effectiveFrom: "desc" }],
    include: { admin: { select: { name: true } } },
  });
  return rules.map((r) => ({
    id: r.id,
    adminId: r.adminId,
    adminName: r.admin?.name ?? null,
    model: (r.model === "turnover" ? "turnover" : "revshare") as CommissionModel,
    rate: dec(r.rate),
    parentSharePct: dec(r.parentSharePct),
    effectiveFrom: dateStr(new Date(r.effectiveFrom)),
    createdAt: new Date(r.createdAt).toISOString(),
  }));
}

/** The rule currently in force for an admin (for the deposit route's
 * stamping and the rules UI). Null = legacy flat % (User.commissionPct). */
export async function getEffectiveRuleNow(adminId: string): Promise<RuleTimelineEntry | null> {
  const timeline = await ruleTimeline(adminId);
  return ruleForDay(timeline, todayStr());
}
