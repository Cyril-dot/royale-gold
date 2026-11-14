// P1 Batch 2 (A24): the owner's fraud alerts — every player
// platform-wide, or one admin's downline in preview (?adminId=).
// P1 Batch 3 (O18): the owner's global fraud console — the same route
// now also returns the per-admin rollups (which admin's downline
// carries the most high-severity alerts), computed by
// computeOwnerFraud() in src/lib/fraud.ts. The signal logic is reused,
// not duplicated. Signal (d) — failed logins — is still not built:
// there is no login-attempt data to count from.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/http";
import { computeOwnerFraud } from "@/lib/fraud";

export async function GET(req: Request) {
  try {
    await requireRole("owner");
    const sp = new URL(req.url).searchParams;
    const adminId = sp.get("adminId") || undefined;
    const { alerts, counts, byAdmin } = await computeOwnerFraud();
    if (!adminId) return ok({ alerts, counts, byAdmin });
    // Preview: one admin's downline only (the admin fraud page calls
    // this with ?adminId= when the owner previews an admin's panel).
    const downline = await prisma.user.findMany({
      where: { referredByAdminId: adminId },
      select: { id: true },
    });
    const ids = new Set(downline.map((u) => u.id));
    const scoped = alerts.filter((a) => ids.has(a.userId));
    return ok({
      alerts: scoped,
      counts: {
        high: scoped.filter((a) => a.severity === "high").length,
        medium: scoped.filter((a) => a.severity === "medium").length,
      },
      byAdmin: byAdmin.filter((r) => r.adminId === adminId),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
