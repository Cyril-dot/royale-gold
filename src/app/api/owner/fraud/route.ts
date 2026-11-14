// P1 Batch 2 (A24): the owner's fraud alerts — every player
// platform-wide, or one admin's downline in preview (?adminId=).
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/http";
import { computeFraudAlerts } from "@/lib/fraud";

export async function GET(req: Request) {
  try {
    await requireRole("owner");
    const sp = new URL(req.url).searchParams;
    const adminId = sp.get("adminId") || undefined;
    const users = adminId
      ? await prisma.user.findMany({ where: { referredByAdminId: adminId }, select: { id: true } })
      : await prisma.user.findMany({ select: { id: true } });
    const alerts = await computeFraudAlerts(users.map((u) => u.id));
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
