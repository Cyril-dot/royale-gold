import { prisma } from "./prisma";
import { commissionHistoryDays, commissionSummary } from "./commission";
import { dec } from "./money";

/** The admin panel payload — used by /api/admin/overview and by the owner's preview. */
export async function adminOverview(adminId: string) {
  const admin = await prisma.user.findUnique({ where: { id: adminId } });
  if (!admin) return null;

  const [codes, referredUsers, coinsGivenAgg, summary, history] = await Promise.all([
    prisma.referralCode.findMany({
      where: { adminId },
      orderBy: { createdAt: "desc" },
      select: { id: true, code: true, active: true, createdAt: true },
    }),
    prisma.user.findMany({
      where: { referredByAdminId: adminId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, email: true, phone: true, referralCodeUsed: true, createdAt: true },
    }),
    prisma.redemption.aggregate({
      where: { code: { adminId } },
      _sum: { coins: true },
      _count: true,
    }),
    commissionSummary(adminId),
    commissionHistoryDays(adminId),
  ]);

  return {
    admin: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      commissionPct: dec(admin.commissionPct),
      active: admin.active,
    },
    codes: codes.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
    referredUsers: referredUsers.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
    coinsGiven: coinsGivenAgg._sum.coins ?? 0,
    redemptions: coinsGivenAgg._count,
    commission: summary,
    history,
  };
}
