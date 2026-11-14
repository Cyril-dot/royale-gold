import { prisma } from "./prisma";
import { playerCommission } from "./commission";
import {
  adminScopeAdminIds,
  adminScopeInfo,
  scopedCommissionSummary,
  scopedDayCommissions,
  scopedReferredUserIds,
} from "./hierarchy";
import { dec, round2, todayStr } from "./money";
import { parsePermissions } from "./rbac";

function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayStart(date: string): Date {
  return new Date(date + "T00:00:00Z");
}

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

/** The admin's referred users (the Players list + the Referrals page).
 * P1 Batch 4 (O24): scoped — a parent admin sees their child admins'
 * downlines too, each row labelled with the referring admin. */
export async function referredUsers(adminId: string) {
  const scopeIds = await adminScopeAdminIds(adminId);
  const users = await prisma.user.findMany({
    where: { referredByAdminId: { in: scopeIds } },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, email: true, phone: true, referralCodeUsed: true, referredByAdminId: true, createdAt: true },
  });
  const adminNameById = new Map<string, string>();
  if (scopeIds.length > 1) {
    const admins = await prisma.user.findMany({
      where: { id: { in: scopeIds } },
      select: { id: true, name: true },
    });
    for (const a of admins) adminNameById.set(a.id, a.name);
  }
  return users.map((u) => ({
    ...u,
    referredByAdminName: u.referredByAdminId ? (adminNameById.get(u.referredByAdminId) ?? null) : null,
    createdAt: u.createdAt.toISOString(),
  }));
}

/** The admin panel payload — used by /api/admin/overview and by the owner's preview. */
export async function adminOverview(adminId: string) {
  const admin = await prisma.user.findUnique({ where: { id: adminId } });
  if (!admin) return null;

  const scopeIds = await adminScopeAdminIds(adminId);
  const scope = await adminScopeInfo(adminId);
  const adminNameById = new Map<string, string>();
  if (scope.childAdmins.length > 0) {
    const admins = await prisma.user.findMany({
      where: { id: { in: scopeIds } },
      select: { id: true, name: true },
    });
    for (const a of admins) adminNameById.set(a.id, a.name);
  }
  const [codes, referredUsers, coinsGivenAgg, summary, history] = await Promise.all([
    prisma.referralCode.findMany({
      where: { adminId },
      orderBy: { createdAt: "desc" },
      select: { id: true, code: true, active: true, createdAt: true },
    }),
    prisma.user.findMany({
      where: { referredByAdminId: { in: scopeIds } },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, email: true, phone: true, referralCodeUsed: true, referredByAdminId: true, createdAt: true },
    }),
    prisma.redemption.aggregate({
      where: { code: { adminId: { in: scopeIds } } },
      _sum: { coins: true },
      _count: true,
    }),
    scopedCommissionSummary(adminId),
    scopedDayCommissions(adminId),
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
    referredUsers: referredUsers.map((u) => ({
      ...u,
      referredByAdminName: u.referredByAdminId ? (adminNameById.get(u.referredByAdminId) ?? null) : null,
      createdAt: u.createdAt.toISOString(),
    })),
    coinsGiven: coinsGivenAgg._sum.coins ?? 0,
    redemptions: coinsGivenAgg._count,
    commission: summary,
    history,
    // P1 Batch 4 (O24): the child admins rolled into these figures.
    // Empty when this admin has no children (not a parent).
    scope,
  };
}

export interface AdminDashboardData {
  today: { deposits: number; depositsTotal: number; newPlayers: number; activePlayers: number; commission: number };
  week: { date: string; deposits: number; total: number }[];
  topPlayers: { id: string; name: string; contact: string | null; deposits: number; totalDeposited: number }[];
  // P1 Batch 4 (O24): the child admins rolled into these figures.
  scope: { childAdmins: { id: string; name: string }[] };
}

/** P0 Batch 4 (A1): the enhanced dashboard — "today so far", the last
 * 7 days of deposits, and the top 5 players by total deposited. Every
 * figure comes from the real tables (DepositEvent / User / GameResult /
 * the commission rules engine); nothing is invented.
 * P1 Batch 4 (O24): scoped — a parent admin's figures roll their child
 * admins' downlines in, labelled via `scope`. */
export async function adminDashboard(adminId: string): Promise<AdminDashboardData> {
  const today = todayStr();
  const fromDate = dayStart(addDays(today, -6));
  const toDate = dayStart(addDays(today, 1));
  const scopeIds = await adminScopeAdminIds(adminId);
  const userIds = await scopedReferredUserIds(adminId);
  const [deposits, newPlayers, activeRounds, summary] = await Promise.all([
    prisma.depositEvent.findMany({
      where: { adminId: { in: scopeIds }, createdAt: { gte: fromDate, lt: toDate } },
      select: { userId: true, amount: true, createdAt: true },
    }),
    prisma.user.count({
      where: { referredByAdminId: { in: scopeIds }, createdAt: { gte: dayStart(today), lt: toDate } },
    }),
    userIds.length === 0
      ? []
      : prisma.gameResult.findMany({
          where: { userId: { in: userIds }, createdAt: { gte: dayStart(today), lt: toDate } },
          select: { userId: true },
        }),
    scopedCommissionSummary(adminId),
  ]);
  const week: { date: string; deposits: number; total: number }[] = [];
  for (let i = 6; i >= 0; i--) week.push({ date: addDays(today, -i), deposits: 0, total: 0 });
  const byDate = new Map(week.map((w) => [w.date, w]));
  const perUser = new Map<string, { deposits: number; total: number }>();
  for (const d of deposits) {
    const w = byDate.get(d.createdAt.toISOString().slice(0, 10));
    if (w) {
      w.deposits += 1;
      w.total = round2(w.total + dec(d.amount));
    }
    const p = perUser.get(d.userId) ?? { deposits: 0, total: 0 };
    p.deposits += 1;
    p.total = round2(p.total + dec(d.amount));
    perUser.set(d.userId, p);
  }
  const todayRow = byDate.get(today)!;
  const topIds = [...perUser.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 5);
  const topUsers =
    topIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: topIds.map(([id]) => id) } },
          select: { id: true, name: true, email: true, phone: true },
        });
  const byId = new Map(topUsers.map((u) => [u.id, u]));
  return {
    today: {
      deposits: todayRow.deposits,
      depositsTotal: todayRow.total,
      newPlayers,
      activePlayers: new Set(activeRounds.map((r) => r.userId)).size,
      commission: summary.today,
    },
    week,
    topPlayers: topIds.map(([id, v]) => ({
      id,
      name: byId.get(id)?.name ?? "—",
      contact: byId.get(id)?.email ?? byId.get(id)?.phone ?? null,
      deposits: v.deposits,
      totalDeposited: v.total,
    })),
    scope: await adminScopeInfo(adminId),
  };
}

export interface DownlineNode {
  id: string;
  name: string;
  contact: string | null;
  role: string;
  totalDeposited: number;
  commission: number;
  commissionModel: string;
  commissionRate: number;
  children: DownlineNode[];
  deeper: boolean;
}

/** P0 Batch 4 (A9): the downline tree — the admin at the root, their
 * referred players below, and any players referred by those players
 * below them, recursively. The data model only links a player to their
 * referring ADMIN (User.referredByAdminId — only admins hold referral
 * codes), so in practice the tree is two levels deep; the builder is
 * recursive anyway, and the render caps at 3 levels with a "more" note
 * when a level-3 node still has children. Each node carries total
 * deposited + commission earned for the root admin (the commission page
 * is the source of truth). */
export async function downlineTree(adminId: string): Promise<{ root: { id: string; name: string }; children: DownlineNode[] }> {
  const admin = await prisma.user.findUnique({ where: { id: adminId }, select: { id: true, name: true } });
  if (!admin) return { root: { id: adminId, name: "—" }, children: [] };
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, phone: true, role: true, referredByAdminId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const deposits = await prisma.depositEvent.groupBy({
    by: ["userId"],
    _sum: { amount: true },
  });
  const depositedBy = new Map(deposits.map((d) => [d.userId, dec(d._sum.amount)]));
  const childrenOf = new Map<string, typeof users>();
  for (const u of users) {
    if (!u.referredByAdminId) continue;
    const list = childrenOf.get(u.referredByAdminId) ?? [];
    list.push(u);
    childrenOf.set(u.referredByAdminId, list);
  }
  const build = async (userId: string, depth: number): Promise<DownlineNode[]> => {
    const kids = childrenOf.get(userId) ?? [];
    const nodes: DownlineNode[] = [];
    for (const k of kids) {
      const pc = await playerCommission(adminId, k.id);
      const grandkids = childrenOf.get(k.id) ?? [];
      nodes.push({
        id: k.id,
        name: k.name,
        contact: k.email ?? k.phone ?? null,
        role: k.role,
        totalDeposited: depositedBy.get(k.id) ?? 0,
        commission: pc.total,
        commissionModel: pc.model,
        commissionRate: pc.rate,
        children: depth >= 3 ? [] : await build(k.id, depth + 1),
        deeper: depth >= 3 && grandkids.length > 0,
      });
    }
    return nodes;
  };
  return { root: { id: admin.id, name: admin.name }, children: await build(adminId, 1) };
}
