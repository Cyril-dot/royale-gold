// P2 Batch 1 (A26): VIP tiers for the admin's downline — the tiers
// themselves plus each player's tier, computed live from the real
// deposit ledger. VIP is a LABEL + perks text only: it changes no
// economy, limits or payouts (the page says so). The owner edits the
// tiers on the owner panel; this endpoint only SHOWS them.
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/http";
import { adminScopeAdminIds } from "@/lib/hierarchy";
import { getVipTiers, tierFor, totalsDeposited } from "@/lib/vip";

export async function GET(req: Request) {
  try {
    const me = await requireRole("admin", "owner");
    const sp = new URL(req.url).searchParams;
    // Owner preview (?adminId=) scopes to that admin's players.
    const adminId = me.role === "admin" ? me.id : sp.get("adminId") || undefined;
    if (me.role === "admin") requirePermission(me, "players");
    if (me.role === "owner" && !adminId) {
      const tiers = await getVipTiers(me.id);
      return ok({ tiers, players: [] });
    }
    if (!adminId) return ok({ tiers: await getVipTiers(me.id), players: [] });

    const tiers = await getVipTiers(me.id);
    const scopeIds = await adminScopeAdminIds(adminId);
    const users = await prisma.user.findMany({
      where: { referredByAdminId: { in: scopeIds } },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, email: true, phone: true },
    });
    const totals = await totalsDeposited(users.map((u) => u.id));
    return ok({
      tiers,
      players: users.map((u) => {
        const total = totals.get(u.id) ?? 0;
        const tier = tierFor(total, tiers);
        return {
          id: u.id,
          name: u.name,
          contact: u.email ?? u.phone ?? null,
          totalDeposited: total,
          tier: tier ? { id: tier.id, name: tier.name, minDeposited: tier.minDeposited, perks: tier.perks } : null,
        };
      }),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
