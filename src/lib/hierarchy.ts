// P1 Batch 4 (O24) — agent hierarchy & credit lines.
//
// An admin can have a PARENT admin (a senior agent). The parent sees
// their own downline PLUS their child admins' downlines as a READ-ONLY
// rollup on the parent's Overview / Commission / Players pages — the
// parent's totals include the child downlines, labelled as such.
//
// The hierarchy is OPTIONAL: an admin with no parent or no children
// works exactly as before (scope = [self], so every scoped helper
// below returns byte-identical figures to its unscoped twin).
//
// SCOPING RULE (do not break it): the owner-global endpoints (rollup,
// P&L, revenue, settlement, /api/owner/admins) MUST keep calling the
// own-downline-only helpers in commission.ts — calling a scoped helper
// there would double-count a child's commission (once under the child,
// once under the parent). The scoped helpers here are used ONLY by the
// admin's own pages (and the owner preview of those pages, which is
// the admin's view).
import { prisma } from "./prisma";
import {
  commissionOwed,
  commissionSummary,
  dayCommissions,
  depositsForAdminOn,
  type CommissionDay,
  type CommissionSummary,
  type DepositRow,
} from "./commission";
import { dec, round2 } from "./money";

/** All descendant admin ids of an admin (children, grandchildren...). */
export async function childAdminIds(adminId: string): Promise<string[]> {
  const all = await prisma.user.findMany({
    where: { role: "admin" },
    select: { id: true, parentAdminId: true },
  });
  const childrenOf = new Map<string, string[]>();
  for (const a of all) {
    if (!a.parentAdminId) continue;
    const list = childrenOf.get(a.parentAdminId) ?? [];
    list.push(a.id);
    childrenOf.set(a.parentAdminId, list);
  }
  const out: string[] = [];
  const queue = [...(childrenOf.get(adminId) ?? [])];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    out.push(cur);
    queue.push(...(childrenOf.get(cur) ?? []));
  }
  return out;
}

/** The admin's scope: themselves + every descendant admin. */
export async function adminScopeAdminIds(adminId: string): Promise<string[]> {
  return [adminId, ...(await childAdminIds(adminId))];
}

/** Scope info for a page label: the child admins (id + name). Empty = not a parent. */
export async function adminScopeInfo(adminId: string): Promise<{
  childAdmins: { id: string; name: string }[];
}> {
  const kids = await childAdminIds(adminId);
  if (kids.length === 0) return { childAdmins: [] };
  const rows = await prisma.user.findMany({
    where: { id: { in: kids } },
    select: { id: true, name: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r.name]));
  return { childAdmins: kids.map((id) => ({ id, name: byId.get(id) ?? "—" })) };
}

/**
 * True when setting `parentId` as `adminId`'s parent would create a
 * cycle (or is self). Walks the parent chain up from `parentId` — if
 * it ever reaches `adminId`, the assignment is rejected. A pre-existing
 * cycle is also refused rather than looped.
 */
export async function wouldCreateCycle(adminId: string, parentId: string): Promise<boolean> {
  if (parentId === adminId) return true;
  let cur: string | null = parentId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === adminId) return true;
    if (seen.has(cur)) return true;
    seen.add(cur);
    const row: { parentAdminId: string | null } | null = await prisma.user.findUnique({
      where: { id: cur },
      select: { parentAdminId: true },
    });
    cur = row?.parentAdminId ?? null;
  }
  return false;
}

/** User ids referred by an admin OR any of their descendant admins. */
export async function scopedReferredUserIds(adminId: string): Promise<string[]> {
  const scope = await adminScopeAdminIds(adminId);
  const users = await prisma.user.findMany({
    where: { referredByAdminId: { in: scope } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/** Merge one CommissionDay per scope admin into one row per date. */
export function mergeCommissionDays(daysByAdmin: CommissionDay[][]): CommissionDay[] {
  const byDate = new Map<string, CommissionDay[]>();
  for (const days of daysByAdmin) {
    for (const d of days) {
      const list = byDate.get(d.date) ?? [];
      list.push(d);
      byDate.set(d.date, list);
    }
  }
  const out: CommissionDay[] = [];
  for (const [date, rows] of [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))) {
    const models = new Set(rows.map((r) => r.model));
    const rates = new Set(rows.map((r) => r.rate));
    const pcts = new Set(rows.map((r) => r.parentSharePct));
    out.push({
      date,
      // Phase 1 country-based (Nov 2026): merged days are all in the
      // one fiat the callers asked for.
      fiatCurrency: rows[0]?.fiatCurrency ?? "GHS",
      deposits: rows.reduce((s, r) => s + r.deposits, 0),
      totalAmount: round2(rows.reduce((s, r) => s + r.totalAmount, 0)),
      totalStakes: round2(rows.reduce((s, r) => s + r.totalStakes, 0)),
      totalPayouts: round2(rows.reduce((s, r) => s + r.totalPayouts, 0)),
      totalCommission: round2(rows.reduce((s, r) => s + r.totalCommission, 0)),
      model: models.size === 1 ? [...models][0] : "mixed",
      rate: rates.size === 1 ? [...rates][0] : 0,
      parentSharePct: pcts.size === 1 ? [...pcts][0] : 0,
    });
  }
  return out;
}

/** Every commission day for an admin + their descendant admins, merged by date. */
export async function scopedDayCommissions(
  adminId: string,
  from?: string,
  to?: string,
  fiatCurrency: string = "GHS",
): Promise<CommissionDay[]> {
  const scope = await adminScopeAdminIds(adminId);
  const per = await Promise.all(scope.map((id) => dayCommissions(id, from, to, fiatCurrency)));
  return mergeCommissionDays(per);
}

/** Commission summary (today/yesterday/7d/30d/all-time) over the admin + descendants, in one fiat. */
export async function scopedCommissionSummary(adminId: string, fiatCurrency: string = "GHS"): Promise<CommissionSummary> {
  const scope = await adminScopeAdminIds(adminId);
  const per = await Promise.all(scope.map((id) => commissionSummary(id, fiatCurrency)));
  const sum = (k: "today" | "yesterday" | "last7d" | "last30d" | "allTime") => round2(per.reduce((s, p) => s + p[k], 0));
  return {
    fiatCurrency,
    today: sum("today"),
    yesterday: sum("yesterday"),
    last7d: sum("last7d"),
    last30d: sum("last30d"),
    allTime: sum("allTime"),
  };
}

/** Commission owed over a period, admin + descendants, in one fiat. */
export async function scopedCommissionOwed(adminId: string, from: string, to: string, fiatCurrency: string = "GHS"): Promise<number> {
  const scope = await adminScopeAdminIds(adminId);
  let total = 0;
  for (const id of scope) total = round2(total + (await commissionOwed(id, from, to, fiatCurrency)));
  return total;
}

/**
 * The parent's share of ONE admin's commission over a period — the O24
 * reporting line. For each day, the day's commission × the parent-share
 * % in force that day. 0 when the admin has no parent or the rule sets
 * no split. NEVER deducted from the child's payout.
 */
export async function parentShareOwed(adminId: string, from: string, to: string, fiatCurrency: string = "GHS"): Promise<number> {
  const admin = await prisma.user.findUnique({
    where: { id: adminId },
    select: { parentAdminId: true },
  });
  if (!admin?.parentAdminId) return 0;
  const days = await dayCommissions(adminId, from, to, fiatCurrency);
  return round2(days.reduce((s, d) => s + d.totalCommission * (d.parentSharePct / 100), 0));
}

/**
 * The scoped version of depositsForAdminOn: the admin's day detail
 * with the child downlines rolled in. Each deposit row carries the
 * referring admin's name so the parent can see whose downline it came
 * from. The totals are the merged scoped day (not the stamped sum).
 */
export async function depositsForAdminOnScoped(
  adminId: string,
  date: string,
  fiatCurrency: string = "GHS",
): Promise<{
  date: string;
  fiatCurrency: string;
  deposits: (DepositRow & { adminName: string })[];
  totals: { deposits: number; totalAmount: number; totalCommission: number; totalStakes: number; totalPayouts: number; model: string; rate: number };
  scope: { childAdmins: { id: string; name: string }[] };
}> {
  const own = await depositsForAdminOn(adminId, date, fiatCurrency);
  const scope = await adminScopeInfo(adminId);
  if (scope.childAdmins.length === 0) {
    return {
      date: own.date,
      fiatCurrency,
      deposits: own.deposits.map((d) => ({ ...d, adminName: "" })),
      totals: {
        deposits: own.totals.deposits,
        totalAmount: own.totals.totalAmount,
        totalCommission: own.totals.totalCommission,
        totalStakes: own.totals.totalStakes,
        totalPayouts: own.totals.totalPayouts,
        model: own.totals.model,
        rate: own.totals.rate,
      },
      scope,
    };
  }
  // Re-fetch the day's deposits across the whole scope (the unscoped
  // helper only saw this admin's own rows).
  const scopeIds = [adminId, ...scope.childAdmins.map((c) => c.id)];
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(`${date}T23:59:59.999Z`);
  const rows = await prisma.depositEvent.findMany({
    where: { adminId: { in: scopeIds }, fiatCurrency, createdAt: { gte: start, lte: end } },
    // Select only the columns the rows map: an unfiltered select also
    // pulls newer columns (providerPayload) that prod may not have yet,
    // and the whole query throws. (Prisma takes either select or
    // include — the relations live inside select here.)
    select: {
      id: true, userId: true, amount: true, method: true, commission: true,
      pctInForce: true, fiatCurrency: true, createdAt: true,
      user: { select: { id: true, name: true, email: true, phone: true } },
      admin: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const days = await scopedDayCommissions(adminId, date, date, fiatCurrency);
  const day = days[0];
  return {
    date,
    fiatCurrency,
    deposits: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.user.name,
      userContact: r.user.email ?? r.user.phone ?? null,
      amount: dec(r.amount),
      method: r.method,
      fiatCurrency: r.fiatCurrency ?? "GHS",
      pctInForce: dec(r.pctInForce),
      commission: dec(r.commission),
      time: r.createdAt.toISOString(),
      adminName: r.admin?.name ?? "",
    })),
    totals: {
      deposits: rows.length,
      totalAmount: round2(rows.reduce((s, r) => s + dec(r.amount), 0)),
      totalCommission: day?.totalCommission ?? 0,
      totalStakes: day?.totalStakes ?? 0,
      totalPayouts: day?.totalPayouts ?? 0,
      model: day?.model ?? "legacy",
      rate: day?.rate ?? 0,
    },
    scope,
  };
}
