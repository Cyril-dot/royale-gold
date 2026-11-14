// P0 Batch 3 (O4): the commission rules engine — owner only.
// GET lists every rule (global default + per-admin, newest first).
// POST sets a rule: { adminId (null = global default), model
// ("revshare" | "turnover"), rate (0–100), effectiveFrom (YYYY-MM-DD,
// default today) }. A new rule never rewrites history — it applies from
// its effectiveFrom date, so past days stay frozen on the rule that was
// in force then.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { listCommissionRules } from "@/lib/commission";
import { todayStr } from "@/lib/money";

export async function GET() {
  try {
    await requireRole("owner");
    return ok({ rules: await listCommissionRules() });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const owner = await requireRole("owner");
    const body = await readJson<{ adminId?: string | null; model?: string; rate?: number; parentSharePct?: number; effectiveFrom?: string }>(req);
    if (!body) return fail("Invalid JSON body");
    const model = body.model;
    if (model !== "revshare" && model !== "turnover") {
      return fail('model must be "revshare" or "turnover"');
    }
    const rate = Number(body.rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      return fail("rate must be between 0 and 100");
    }
    // P1 Batch 4 (O24): the parent's share % of this admin's commission
    // — a REPORTING line on the settlement, never a deduction.
    const parentSharePct = body.parentSharePct === undefined || body.parentSharePct === null ? 0 : Number(body.parentSharePct);
    if (!Number.isFinite(parentSharePct) || parentSharePct < 0 || parentSharePct > 100) {
      return fail("parentSharePct must be between 0 and 100");
    }
    const effectiveFrom = body.effectiveFrom ?? todayStr();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) return fail("effectiveFrom must be YYYY-MM-DD");
    const adminId = body.adminId ?? null;
    let adminName: string | null = null;
    if (adminId) {
      const admin = await prisma.user.findUnique({ where: { id: adminId } });
      if (!admin || admin.role !== "admin") return fail("Admin not found", 404);
      adminName = admin.name;
    }
    const created = await prisma.$transaction(async (tx) => {
      const rule = await tx.commissionRule.create({
        data: {
          adminId,
          model,
          rate: Number(rate.toFixed(2)),
          parentSharePct: Number(parentSharePct.toFixed(2)),
          effectiveFrom: new Date(`${effectiveFrom}T00:00:00.000Z`),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: owner.id,
          action: "commission.rule.set",
          targetId: adminId ?? "global",
          detail: `Set ${model} ${rate}%${parentSharePct > 0 ? ` (parent share ${parentSharePct}%)` : ""} ${adminId ? `for ${adminName}` : "as the global default"} from ${effectiveFrom}`,
        },
      });
      return rule;
    });
    return ok(
      {
        rule: {
          id: created.id,
          adminId: created.adminId,
          adminName,
          model: created.model,
          rate: Number(created.rate.toString()),
          parentSharePct: Number(created.parentSharePct.toString()),
          effectiveFrom,
          createdAt: created.createdAt.toISOString(),
        },
      },
      201,
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
