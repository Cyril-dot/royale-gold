import { prisma } from "./prisma";
import { commissionHistoryDays, commissionSummary } from "./commission";
import { dec } from "./money";
import { parsePermissions } from "./rbac";

/** The admin's identity for page headers — P0 Batch 3 (O3). Every admin
 * page loads this (no section permission needed: it is the admin's own
 * identity); the page's DATA endpoint enforces the section permission. */
export async function adminContext(adminId: string) {
  const admin = await prisma.user.findUnique({ where: { id: adminId } });
  if (!admin) return null;
  return {
    admin: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      commissionPct: dec(admin.commissionPct),
      active: admin.active,
      permissions: parsePermissions(admin.permissions),
    },
  };
}

/** The admin's referred users (the Players list + the Referrals page). */
export async function referredUsers(adminId: string) {
  const users = await prisma.user.findMany({
    where: { referredByAdminId: adminId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, email: true, phone: true, referralCodeUsed: true, createdAt: true },
  });
  return users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }));
}

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
      permissions: parsePermissions(admin.permissions),
    },
    codes: codes.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
    referredUsers: referredUsers.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
    coinsGiven: coinsGivenAgg._sum.coins ?? 0,
    redemptions: coinsGivenAgg._count,
    commission: summary,
    history,
  };
}
