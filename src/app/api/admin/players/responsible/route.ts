// P2 Batch 1 (A29): the responsible-gambling list — the admin's
// scoped-downline players with an ACTIVE cool-off or self-exclusion,
// with their until dates. A player whose dates have passed is not
// listed (they are free to play again — the enforcement in
// src/lib/limits.ts reads the same dates).
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { adminScopeAdminIds } from "@/lib/hierarchy";

export async function GET(req: Request) {
  try {
    const me = await requireRole("admin", "owner");
    const sp = new URL(req.url).searchParams;
    // Owner preview (?adminId=) scopes to that admin's players.
    const adminId = me.role === "admin" ? me.id : sp.get("adminId") || undefined;
    if (me.role === "admin") requirePermission(me, "players");
    if (!adminId) return fail("adminId is required");

    const scopeIds = await adminScopeAdminIds(adminId);
    const users = await prisma.user.findMany({
      where: { referredByAdminId: { in: scopeIds } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, name: true, email: true, phone: true,
        limits: {
          select: { coolOffUntil: true, selfExcludedUntil: true, selfExclusionReason: true },
        },
      },
    });
    const now = Date.now();
    const rows = users
      .filter((u) => {
        const l = u.limits;
        if (!l) return false;
        const cool = l.coolOffUntil && l.coolOffUntil.getTime() > now;
        const excl = l.selfExcludedUntil && l.selfExcludedUntil.getTime() > now;
        return cool || excl;
      })
      .map((u) => ({
        id: u.id,
        name: u.name,
        contact: u.email ?? u.phone ?? null,
        coolOffUntil: u.limits!.coolOffUntil && u.limits!.coolOffUntil.getTime() > now
          ? u.limits!.coolOffUntil.toISOString()
          : null,
        selfExcludedUntil: u.limits!.selfExcludedUntil && u.limits!.selfExcludedUntil.getTime() > now
          ? u.limits!.selfExcludedUntil.toISOString()
          : null,
        selfExclusionReason: u.limits!.selfExclusionReason,
      }));
    return ok({ players: rows });
  } catch (err) {
    return toErrorResponse(err);
  }
}
