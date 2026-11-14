// P1 Batch 2 (A24): the admin's fraud alerts — REAL signals computed
// live from the tables (see src/lib/fraud.ts), scoped to the admin's
// own downline. No stored alert rows; every alert can be checked
// against the DB by hand from its reason.
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/http";
import { computeFraudAlerts } from "@/lib/fraud";

export async function GET() {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "fraud");
    const downline = await prisma.user.findMany({
      where: { referredByAdminId: admin.id },
      select: { id: true },
    });
    const alerts = await computeFraudAlerts(downline.map((u) => u.id));
    return ok({
      alerts,
      counts: {
        high: alerts.filter((a) => a.severity === "high").length,
        medium: alerts.filter((a) => a.severity === "medium").length,
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
