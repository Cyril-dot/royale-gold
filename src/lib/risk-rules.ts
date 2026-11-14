// P2 Batch 2 (O31): automated risk rules — actions on top of the 4
// existing fraud signals (a/b/c/e; signal (d) failed-logins does not
// exist — there is no login-attempt data). A rule is a signal +
// threshold + action. Threshold meaning depends on the signal:
//   (a) withdrawal-flags     = minimum risk-flag count on the request (default 2)
//   (b) rapid-withdrawals    = requests in 24h (default 3)
//   (c) deposit-no-play      = GH₵ deposited in 24h with 0 rounds in 24h (default 1000)
//   (e) deposit-then-withdraw = minutes between deposit and withdrawal (default 60)
// Action:
//   "flag"           — the alert already appears in the fraud console; no extra effect.
//   "block_player"   — block the player at once (blockedAt + reason + AuditLog "user.block").
//   "hold_withdrawal" — set the withdrawal "held" for admin review (withdrawal requests only).
// A rule with "block_player" or "hold_withdrawal" is a REAL action —
// the owner page says so plainly, with the action shown on each rule.
//
// Evaluation happens when the event happens (a withdrawal request is
// created, a deposit lands) — AFTER the existing logic, so it never
// changes a deposit or withdrawal outcome except for the rule's own
// action. The deposit evaluation runs after the deposit transaction
// and never fails the deposit (best-effort); the withdrawal
// evaluation runs inside the withdrawal transaction so a hold is
// atomic with the request.
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { dec } from "./money";
import { withdrawalRiskFlags } from "./withdrawals";

export type RiskSignal = "withdrawal-flags" | "rapid-withdrawals" | "deposit-no-play" | "deposit-then-withdraw";
export type RiskAction = "flag" | "block_player" | "hold_withdrawal";

export interface RiskRuleRow {
  id: string;
  name: string;
  signal: RiskSignal;
  threshold: number;
  action: RiskAction;
  active: boolean;
  createdBy: string;
  createdAt: string;
}

export const RISK_SIGNALS: { key: RiskSignal; label: string; thresholdLabel: string; thresholdHint: string; defaultThreshold: number }[] = [
  { key: "withdrawal-flags", label: "Flagged withdrawal", thresholdLabel: "Min risk flags", thresholdHint: "A request carrying this many risk flags fires the rule (default 2 — the fraud console's HIGH bar).", defaultThreshold: 2 },
  { key: "rapid-withdrawals", label: "Rapid withdrawals", thresholdLabel: "Requests in 24h", thresholdHint: "A player with this many withdrawal requests in 24 hours fires the rule (default 3).", defaultThreshold: 3 },
  { key: "deposit-no-play", label: "Deposit, no play", thresholdLabel: "GH₵ deposited in 24h", thresholdHint: "A player who deposited this much in 24 hours and played 0 rounds in 24 hours fires the rule (default GH₵ 1,000).", defaultThreshold: 1000 },
  { key: "deposit-then-withdraw", label: "Deposit then withdraw", thresholdLabel: "Minutes window", thresholdHint: "A withdrawal within this many minutes of a deposit fires the rule (default 60).", defaultThreshold: 60 },
];

export const RISK_ACTIONS: { key: RiskAction; label: string; note: string }[] = [
  { key: "flag", label: "Flag only", note: "The alert already appears in the fraud console — no extra effect." },
  { key: "block_player", label: "Block player", note: "REAL action: the player is blocked at once (no deposits, no play, no withdrawals)." },
  { key: "hold_withdrawal", label: "Hold withdrawal", note: "REAL action: the withdrawal is set to “held” for admin review (withdrawal requests only)." },
];

export function signalLabel(signal: string): string {
  return RISK_SIGNALS.find((s) => s.key === signal)?.label ?? signal;
}

export function actionLabel(action: string): string {
  return RISK_ACTIONS.find((a) => a.key === action)?.label ?? action;
}

export async function getRiskRules(): Promise<RiskRuleRow[]> {
  const rows = await prisma.riskRule.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    signal: r.signal as RiskSignal,
    threshold: dec(r.threshold),
    action: r.action as RiskAction,
    active: r.active,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
  }));
}

const DAY = 24 * 60 * 60 * 1000;

/** The active rules for one signal (newest first). */
async function activeRulesFor(signal: RiskSignal): Promise<RiskRuleRow[]> {
  const rows = await prisma.riskRule.findMany({
    where: { signal, active: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    signal: r.signal as RiskSignal,
    threshold: dec(r.threshold),
    action: r.action as RiskAction,
    active: r.active,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
  }));
}

async function blockPlayer(
  tx: Prisma.TransactionClient,
  userId: string,
  rule: RiskRuleRow,
): Promise<void> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { blockedAt: true } });
  if (user?.blockedAt) return; // Already blocked — do not overwrite the reason.
  await tx.user.update({
    where: { id: userId },
    data: { blockedAt: new Date(), blockedReason: `Auto-blocked by risk rule “${rule.name}”` },
  });
  await tx.auditLog.create({
    data: {
      actorId: rule.createdBy,
      action: "user.block",
      targetId: userId,
      detail: `Auto-blocked by risk rule “${rule.name}” (signal ${signalLabel(rule.signal)}, threshold ${rule.threshold})`,
    },
  });
}

/**
 * Evaluate the withdrawal-time rules for a just-created request.
 * Runs INSIDE the withdrawal transaction (tx) so a hold is atomic
 * with the request. Returns which actions fired.
 */
export async function evaluateWithdrawalRules(
  tx: Prisma.TransactionClient,
  w: { id: string; userId: string; amount: number },
  userCreatedAt: Date,
): Promise<{ held: boolean; blocked: boolean; fired: string[] }> {
  const fired: string[] = [];
  let held = false;
  let blocked = false;
  const now = Date.now();
  const dayAgo = new Date(now - DAY);

  const [flagsRules, rapidRules, quickRules] = await Promise.all([
    activeRulesFor("withdrawal-flags"),
    activeRulesFor("rapid-withdrawals"),
    activeRulesFor("deposit-then-withdraw"),
  ]);
  if (flagsRules.length === 0 && rapidRules.length === 0 && quickRules.length === 0) {
    return { held, blocked, fired };
  }

  // Shared inputs for (a) + (b): the player's 24h request count
  // (including the request just created) and their total deposited.
  const [requestCount, depAgg] = await Promise.all([
    tx.withdrawal.count({ where: { userId: w.userId, createdAt: { gte: dayAgo } } }),
    tx.depositEvent.aggregate({ where: { userId: w.userId }, _sum: { amount: true } }),
  ]);
  const totalDeposited = dec(depAgg._sum.amount);
  const flags = withdrawalRiskFlags({
    userCreatedAt,
    amount: w.amount,
    totalDeposited,
    requestsLast24h: requestCount,
  });

  const apply = async (rule: RiskRuleRow) => {
    fired.push(rule.name);
    if (rule.action === "hold_withdrawal") {
      held = true;
      await tx.withdrawal.update({ where: { id: w.id }, data: { status: "held" } });
      await tx.auditLog.create({
        data: {
          actorId: rule.createdBy,
          action: "risk.rule.hold",
          targetId: w.id,
          detail: `Withdrawal held by risk rule “${rule.name}” (signal ${signalLabel(rule.signal)}, threshold ${rule.threshold}) — admin review required`,
        },
      });
    } else if (rule.action === "block_player") {
      blocked = true;
      await blockPlayer(tx, w.userId, rule);
    }
    // "flag" needs nothing — the fraud console already shows the alert.
  };

  // (a) A request carrying >= threshold risk flags fires.
  for (const rule of flagsRules) {
    if (flags.length >= rule.threshold) await apply(rule);
  }
  // (b) >= threshold requests in 24h fires.
  for (const rule of rapidRules) {
    if (requestCount >= rule.threshold) await apply(rule);
  }
  // (e) A deposit within the threshold minutes before this request fires.
  if (quickRules.length > 0) {
    const deposits = await tx.depositEvent.findMany({
      where: { userId: w.userId, createdAt: { gte: new Date(now - 7 * DAY), lte: new Date(now) } },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    for (const rule of quickRules) {
      const hit = deposits.find((d) => now - d.createdAt.getTime() <= rule.threshold * 60 * 1000);
      if (hit) await apply(rule);
    }
  }
  return { held, blocked, fired };
}

/**
 * Evaluate the deposit-time rules for a deposit that just landed.
 * Runs AFTER the deposit transaction (best-effort — a failure here
 * must never fail the deposit). Only signal (c) is a deposit event;
 * "hold_withdrawal" has no meaning for a deposit and is ignored.
 */
export async function evaluateDepositRules(userId: string): Promise<{ blocked: boolean; fired: string[] }> {
  const fired: string[] = [];
  let blocked = false;
  try {
    const rules = await activeRulesFor("deposit-no-play");
    if (rules.length === 0) return { blocked, fired };
    const now = Date.now();
    const dayAgo = new Date(now - DAY);
    const [depAgg, rounds] = await Promise.all([
      prisma.depositEvent.aggregate({
        where: { userId, createdAt: { gte: dayAgo } },
        _sum: { amount: true },
      }),
      prisma.gameResult.count({ where: { userId, createdAt: { gte: dayAgo } } }),
    ]);
    const deposited24h = dec(depAgg._sum.amount);
    if (rounds > 0) return { blocked, fired };
    for (const rule of rules) {
      if (deposited24h < rule.threshold) continue;
      if (rule.action !== "block_player") continue; // "flag" is automatic; "hold" is withdrawal-only.
      fired.push(rule.name);
      blocked = true;
      await prisma.$transaction(async (tx) => {
        await blockPlayer(tx, userId, rule);
      });
    }
  } catch (err) {
    // Best-effort: a rule failure must never fail the deposit.
    console.error("evaluateDepositRules failed", err);
  }
  return { blocked, fired };
}
