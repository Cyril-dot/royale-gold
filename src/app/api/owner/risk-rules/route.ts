// P2 Batch 2 (O31): automated risk rules — a signal + threshold +
// action. The rules are evaluated when the event happens (a
// withdrawal request is created, a deposit lands) — see
// src/lib/risk-rules.ts. A rule with action "block_player" or
// "hold_withdrawal" is a REAL action; "flag" only adds the alert to
// the fraud console.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { AuthError } from "@/lib/errors";
import { getRiskRules, RISK_SIGNALS, RISK_ACTIONS, signalLabel, actionLabel } from "@/lib/risk-rules";
import { round2 } from "@/lib/money";

export async function GET() {
  try {
    await requireRole("owner");
    const rules = await getRiskRules();
    return ok({
      rules,
      signals: RISK_SIGNALS.map((s) => ({ key: s.key, label: s.label, thresholdLabel: s.thresholdLabel, thresholdHint: s.thresholdHint, defaultThreshold: s.defaultThreshold })),
      actions: RISK_ACTIONS.map((a) => ({ key: a.key, label: a.label, note: a.note })),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireRole("owner");
    const body = await readJson<{ name?: string; signal?: string; threshold?: number; action?: string }>(req);
    const name = (body?.name ?? "").trim();
    if (name.length < 2 || name.length > 60) return fail("The rule needs a name of 2–60 characters");
    const signal = RISK_SIGNALS.find((s) => s.key === body?.signal);
    if (!signal) return fail("Pick one of the 4 fraud signals (a/b/c/e)");
    const threshold = Number(body?.threshold);
    if (!Number.isFinite(threshold) || threshold <= 0) return fail("The threshold must be a number above 0");
    const action = RISK_ACTIONS.find((a) => a.key === body?.action);
    if (!action) return fail("Pick an action: flag, block_player or hold_withdrawal");
    const created = await prisma.riskRule.create({
      data: {
        name, signal: signal.key, threshold: round2(threshold), action: action.key, createdBy: me.id,
      },
    });
    await prisma.auditLog.create({
      data: {
        actorId: me.id, action: "risk.rule.create", targetId: created.id,
        detail: `Risk rule: created “${name}” — ${signalLabel(signal.key)} ≥ ${round2(threshold)} → ${actionLabel(action.key)}`,
      },
    });
    return ok({
      rule: {
        id: created.id, name: created.name, signal: created.signal,
        threshold: round2(Number(created.threshold)), action: created.action,
        active: created.active, createdAt: created.createdAt.toISOString(),
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return toErrorResponse(err);
    if (err instanceof Error) return fail(err.message, 400);
    return toErrorResponse(err);
  }
}
