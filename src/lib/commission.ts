import { prisma } from "./prisma";
import { dateStr, dec, todayStr, yesterdayStr } from "./money";

export interface DepositRow {
  id: string;
  userId: string;
  userName: string;
  userContact: string | null;
  amount: number;
  method: string;
  pctInForce: number;
  commission: number;
  time: string;
}

/** Serialize one DepositEvent with its depositor for day-detail responses. */
export async function depositsForAdminOn(adminId: string, date: string) {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(`${date}T23:59:59.999Z`);
  const rows = await prisma.depositEvent.findMany({
    where: { adminId, createdAt: { gte: start, lte: end } },
    include: { user: { select: { id: true, name: true, email: true, phone: true } } },
    orderBy: { createdAt: "desc" },
  });
  const deposits: DepositRow[] = rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.user.name,
    userContact: r.user.email ?? r.user.phone ?? null,
    amount: dec(r.amount),
    method: r.method,
    pctInForce: dec(r.pctInForce),
    commission: dec(r.commission),
    time: r.createdAt.toISOString(),
  }));
  const totals = {
    deposits: deposits.length,
    totalAmount: deposits.reduce((s, d) => s + d.amount, 0),
    totalCommission: deposits.reduce((s, d) => s + d.commission, 0),
  };
  return { date, deposits, totals };
}

export interface CommissionSummary {
  today: number;
  yesterday: number;
  last7d: number;
  last30d: number;
  allTime: number;
}

async function sumCommission(adminId: string, gte?: Date, lte?: Date): Promise<number> {
  const agg = await prisma.depositEvent.aggregate({
    where: { adminId, ...(gte || lte ? { createdAt: { gte, lte } } : {}) },
    _sum: { commission: true },
  });
  return dec(agg._sum.commission);
}

/** Today / Yesterday / 7d / 30d / all-time commission for one admin. */
export async function commissionSummary(adminId: string): Promise<CommissionSummary> {
  const now = new Date();
  const startOfToday = new Date(`${todayStr(now)}T00:00:00.000Z`);
  const startOfYesterday = new Date(`${yesterdayStr()}T00:00:00.000Z`);
  const d7 = new Date(startOfToday);
  d7.setUTCDate(d7.getUTCDate() - 6);
  const d30 = new Date(startOfToday);
  d30.setUTCDate(d30.getUTCDate() - 29);
  const [today, yesterday, last7d, last30d, allTime] = await Promise.all([
    sumCommission(adminId, startOfToday),
    sumCommission(adminId, startOfYesterday, startOfToday),
    sumCommission(adminId, d7),
    sumCommission(adminId, d30),
    sumCommission(adminId),
  ]);
  return { today, yesterday, last7d, last30d, allTime };
}

/** Every day on which the admin earned commission, newest first. */
export async function commissionHistoryDays(adminId: string) {
  const rows = await prisma.depositEvent.findMany({
    where: { adminId },
    select: { amount: true, commission: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const byDay = new Map<string, { deposits: number; totalAmount: number; totalCommission: number }>();
  for (const r of rows) {
    const day = dateStr(r.createdAt);
    const cur = byDay.get(day) ?? { deposits: 0, totalAmount: 0, totalCommission: 0 };
    cur.deposits += 1;
    cur.totalAmount += dec(r.amount);
    cur.totalCommission += dec(r.commission);
    byDay.set(day, cur);
  }
  return [...byDay.entries()]
    .map(([date, t]) => ({ date, ...t }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}
