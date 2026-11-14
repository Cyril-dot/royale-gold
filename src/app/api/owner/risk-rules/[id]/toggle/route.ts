// P2 Batch 2 (O31): enable / disable a risk rule. A disabled rule
// is never evaluated — the fraud console still shows its signal's
// alerts, but the rule takes no action.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { AuthError } from "@/lib/errors";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireRole("owner");
    const { id } = await params;
    const rule = await prisma.riskRule.findUnique({ where: { id } });
    if (!rule) return fail("Risk rule not found", 404);
    const updated = await prisma.riskRule.update({ where: { id }, data: { active: !rule.active } });
    await prisma.auditLog.create({
      data: {
        actorId: me.id, action: updated.active ? "risk.rule.enable" : "risk.rule.disable", targetId: rule.id,
        detail: `Risk rule: ${updated.active ? "enabled" : "disabled"} “${rule.name}”`,
      },
    });
    return ok({ rule: { id: updated.id, name: updated.name, active: updated.active } });
  } catch (err) {
    if (err instanceof AuthError) return toErrorResponse(err);
    if (err instanceof Error) return fail(err.message, 400);
    return toErrorResponse(err);
  }
}
