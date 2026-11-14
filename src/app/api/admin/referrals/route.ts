// P0 Batch 3 (O3): the Referrals page's data, split out of the overview
// endpoint so it can be gated by its own "referrals" permission. Same
// data as before (codes + referred users + coins given + redemptions).
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/http";
import { referredUsers } from "@/lib/admin";

export async function GET() {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "referrals");
    const [codes, users, coinsGivenAgg] = await Promise.all([
      prisma.referralCode.findMany({
        where: { adminId: admin.id },
        orderBy: { createdAt: "desc" },
        select: { id: true, code: true, active: true, createdAt: true },
      }),
      referredUsers(admin.id),
      prisma.redemption.aggregate({
        where: { code: { adminId: admin.id } },
        _sum: { coins: true },
        _count: true,
      }),
    ]);
    return ok({
      codes: codes.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
      referredUsers: users,
      coinsGiven: coinsGivenAgg._sum.coins ?? 0,
      redemptions: coinsGivenAgg._count,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
