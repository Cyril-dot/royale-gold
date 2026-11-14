// P2 Batch 2 (O28): loyalty config on top of the VIP tiers (A26).
// A dedicated LoyaltySettings model (id always "global"), like
// KycSettings — a distinct settings domain with its own endpoint.
//
// pointsPerGhs is a READ-ONLY display rule (1 point per GH₵ 1 staked
// by default): a player's points are computed live from their total
// staked (GameResult) — there is NO points ledger. The tier-upgrade
// rule is the A26 rule (total deposited reaches the tier's
// minDeposited) and is shown on the page, not re-implemented here.
//
// birthdayBonus is the GH₵ credited as a bonus on a player's
// birthday, paid ONCE per year by a MANUAL owner action ("Pay
// birthday bonuses for today") — there is NO cron, so it is a button,
// not automatic, and the page says so. 0 = no birthday bonus.
import { prisma } from "./prisma";
import { dec, round2, todayStr } from "./money";

export interface LoyaltySettingsRow {
  pointsPerGhs: number;
  birthdayBonus: number;
}

export async function getLoyaltySettings(): Promise<LoyaltySettingsRow> {
  let row = await prisma.loyaltySettings.findUnique({ where: { id: "global" } });
  if (!row) {
    row = await prisma.loyaltySettings.create({ data: { id: "global" } });
  }
  return { pointsPerGhs: dec(row.pointsPerGhs), birthdayBonus: dec(row.birthdayBonus) };
}

/** A player's loyalty points, live from their total staked. */
export async function pointsFor(userId: string, pointsPerGhs: number): Promise<{ points: number; totalStaked: number }> {
  const agg = await prisma.gameResult.aggregate({
    where: { userId },
    _sum: { stake: true },
  });
  const totalStaked = dec(agg._sum.stake);
  return { points: Math.floor(totalStaked * pointsPerGhs), totalStaked: round2(totalStaked) };
}

/** Players whose birthday is today (month + day match), with whether
 * they have already been paid this year. */
export async function birthdaysToday(): Promise<{ userId: string; userName: string; userContact: string | null; birthday: string; paidThisYear: boolean }[]> {
  const today = todayStr();
  const month = Number(today.slice(5, 7));
  const day = Number(today.slice(8, 10));
  const year = Number(today.slice(0, 4));
  const users = await prisma.user.findMany({
    where: { role: "user", birthday: { not: null } },
    select: { id: true, name: true, email: true, phone: true, birthday: true },
  });
  const todays = users.filter((u) => {
    if (!u.birthday) return false;
    const b = new Date(u.birthday);
    return b.getUTCMonth() + 1 === month && b.getUTCDate() === day;
  });
  if (todays.length === 0) return [];
  const grants = await prisma.birthdayBonusGrant.findMany({
    where: { userId: { in: todays.map((u) => u.id) }, year },
    select: { userId: true },
  });
  const paid = new Set(grants.map((g) => g.userId));
  return todays.map((u) => ({
    userId: u.id,
    userName: u.name,
    userContact: u.email ?? u.phone ?? null,
    birthday: u.birthday!.toISOString().slice(0, 10),
    paidThisYear: paid.has(u.id),
  }));
}

/**
 * Pay the birthday bonus to every player whose birthday is today and
 * who has not been paid this year. One bonus credit per player via
 * the bonus-grant path (wallet credit + BalanceAdjustment kind
 * "bonus" + AuditLog "loyalty.birthday") + a BirthdayBonusGrant row,
 * all in one transaction. Returns who was paid and the total.
 * A birthday bonus of 0 pays nobody.
 */
export async function payBirthdayBonuses(ownerId: string): Promise<{ paid: { userId: string; userName: string; amount: number }[]; total: number; skippedPaid: number }> {
  const settings = await getLoyaltySettings();
  const year = Number(todayStr().slice(0, 4));
  if (settings.birthdayBonus <= 0) {
    const todays = await birthdaysToday();
    return { paid: [], total: 0, skippedPaid: todays.filter((t) => t.paidThisYear).length };
  }
  const todays = await birthdaysToday();
  const due = todays.filter((t) => !t.paidThisYear);
  const amount = round2(settings.birthdayBonus);
  const paid: { userId: string; userName: string; amount: number }[] = [];
  await prisma.$transaction(async (tx) => {
    for (const t of due) {
      const user = await tx.user.findUnique({ where: { id: t.userId } });
      if (!user) continue;
      await tx.user.update({
        where: { id: t.userId },
        data: { cashBalance: round2(dec(user.cashBalance) + amount) },
      });
      await tx.balanceAdjustment.create({
        data: {
          userId: t.userId, adminId: ownerId, wallet: "cash", direction: "credit",
          amount, reason: `Birthday bonus ${year}`, kind: "bonus",
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: ownerId, action: "bonus.grant", targetId: t.userId,
          detail: `Birthday bonus: paid GH₵ ${amount.toFixed(2)} to ${t.userName} (${year})`,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: ownerId, action: "loyalty.birthday", targetId: t.userId,
          detail: `Birthday bonus: GH₵ ${amount.toFixed(2)} to ${t.userName} for ${year}`,
        },
      });
      await tx.birthdayBonusGrant.create({
        data: { userId: t.userId, year, amount },
      });
      paid.push({ userId: t.userId, userName: t.userName, amount });
    }
  });
  return { paid, total: round2(paid.reduce((s, p) => s + p.amount, 0)), skippedPaid: todays.filter((t) => t.paidThisYear).length };
}
