// P1 Batch 3 (O19): the owner's promotion engine — named campaigns on
// top of the admin bonus grant (A17) and promo codes (A18), which it
// does NOT change. Three types, no wagering requirements anywhere
// (there is no wagering system in this codebase):
//   deposit_match — match a % of a deposit up to `cap` GH₵, once per
//     player per promotion, credited automatically in the deposit route.
//   free_coins    — grant `coinAmount` coins on signup or on first
//     deposit (`trigger`), once per player per promotion, credited in
//     the register / deposit routes.
//   cashback      — return `percent`% of a day's net cash loss, capped
//     at `cap` GH₵. There is no cron infra, so cashback is paid by a
//     MANUAL owner action ("Pay cashback for {date}"), never automatic.
//
// A promotion only grants while live: active AND now inside
// [startAt, endAt]. `targetAdminId` null = every player; set = that
// admin's downline only. Every credit lands as one atomic unit: wallet
// credit + PromotionGrant + BalanceAdjustment (kind "bonus", so the
// ledger names it a bonus) + AuditLog "promotion.grant" /
// "promotion.cashback". The reason on the adjustment names the
// promotion, so the ledger shows exactly where the money came from.
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { dec, round2 } from "./money";

export type PromotionType = "deposit_match" | "free_coins" | "cashback";
export const PROMOTION_TYPES: PromotionType[] = ["deposit_match", "free_coins", "cashback"];

type Tx = Prisma.TransactionClient;

export interface PromotionRow {
  id: string;
  name: string;
  type: PromotionType;
  percent: number;
  cap: number | null;
  coinAmount: number | null;
  trigger: string | null;
  startAt: string;
  endAt: string | null;
  targetAdminId: string | null;
  targetAdminName: string | null;
  active: boolean;
  grants: number;
  createdAt: string;
}

export interface PromotionGrantRow {
  id: string;
  promotionId: string;
  promotionName: string;
  userId: string;
  userName: string;
  amount: number;
  wallet: string;
  day: string;
  createdAt: string;
}

export function isLive(p: { active: boolean; startAt: Date; endAt: Date | null }, now = new Date()): boolean {
  if (!p.active) return false;
  if (now < p.startAt) return false;
  if (p.endAt && now > p.endAt) return false;
  return true;
}

function targetMatches(p: { targetAdminId: string | null }, referredByAdminId: string | null): boolean {
  return p.targetAdminId === null || p.targetAdminId === referredByAdminId;
}

export async function listPromotions(): Promise<{ promotions: PromotionRow[]; recentGrants: PromotionGrantRow[] }> {
  const [promos, grants] = await Promise.all([
    prisma.promotion.findMany({
      include: {
        targetAdmin: { select: { name: true } },
        _count: { select: { grants: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.promotionGrant.findMany({
      include: {
        promotion: { select: { name: true } },
        user: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  return {
    promotions: promos.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type as PromotionType,
      percent: dec(p.percent),
      cap: p.cap == null ? null : dec(p.cap),
      coinAmount: p.coinAmount,
      trigger: p.trigger,
      startAt: p.startAt.toISOString(),
      endAt: p.endAt?.toISOString() ?? null,
      targetAdminId: p.targetAdminId,
      targetAdminName: p.targetAdmin?.name ?? null,
      active: p.active,
      grants: p._count.grants,
      createdAt: p.createdAt.toISOString(),
    })),
    recentGrants: grants.map((g) => ({
      id: g.id,
      promotionId: g.promotionId,
      promotionName: g.promotion.name,
      userId: g.userId,
      userName: g.user.name,
      amount: dec(g.amount),
      wallet: g.wallet,
      day: g.day,
      createdAt: g.createdAt.toISOString(),
    })),
  };
}

export async function createPromotion(
  input: {
    name: string;
    type: string;
    percent?: number;
    cap?: number | null;
    coinAmount?: number | null;
    trigger?: string | null;
    startAt: string;
    endAt?: string | null;
    targetAdminId?: string | null;
  },
  createdBy: string,
) {
  const name = (input.name ?? "").trim();
  if (name.length < 3) throw new Error("A promotion name is required (at least 3 characters)");
  if (!PROMOTION_TYPES.includes(input.type as PromotionType)) {
    throw new Error("Type must be deposit_match, free_coins or cashback");
  }
  const type = input.type as PromotionType;
  const percent = Number(input.percent ?? 0);
  const coinAmount = input.coinAmount == null ? null : Number(input.coinAmount);
  const cap = input.cap == null ? null : Number(input.cap);
  if (type !== "free_coins" && (!Number.isFinite(percent) || percent <= 0 || percent > 100)) {
    throw new Error("Percent must be between 0 and 100");
  }
  if (type === "free_coins" && (coinAmount === null || !Number.isInteger(coinAmount) || coinAmount <= 0)) {
    throw new Error("Free-coins promotions need a whole number of coins");
  }
  if (cap !== null && (!Number.isFinite(cap) || cap < 0)) throw new Error("Cap must be 0 or more");
  const startAt = new Date(`${input.startAt}T00:00:00Z`);
  if (Number.isNaN(startAt.getTime())) throw new Error("Start date must be a date (YYYY-MM-DD)");
  let endAt: Date | null = null;
  if (input.endAt) {
    endAt = new Date(`${input.endAt}T23:59:59Z`);
    if (Number.isNaN(endAt.getTime())) throw new Error("End date must be a date (YYYY-MM-DD)");
    if (endAt < startAt) throw new Error("End date cannot be before the start date");
  }
  let trigger: string | null = null;
  if (type === "free_coins") {
    trigger = input.trigger === "first_deposit" ? "first_deposit" : "signup";
  }
  let targetAdminId: string | null = input.targetAdminId || null;
  if (targetAdminId) {
    const admin = await prisma.user.findUnique({ where: { id: targetAdminId } });
    if (!admin || admin.role !== "admin") throw new Error("Target must be an existing admin");
  }
  const promo = await prisma.$transaction(async (tx) => {
    const created = await tx.promotion.create({
      data: {
        name,
        type,
        percent: type === "free_coins" ? 0 : round2(percent),
        cap: cap === null ? null : round2(cap),
        coinAmount: type === "free_coins" ? coinAmount : null,
        trigger,
        startAt,
        endAt,
        targetAdminId,
        createdBy,
      },
    });
    await tx.auditLog.create({
      data: { actorId: createdBy, action: "promotion.create", targetId: created.id, detail: `Promotion created: ${name} (${type})` },
    });
    return created;
  });
  return promo;
}

export async function togglePromotion(id: string, active: boolean, actorId: string) {
  const promo = await prisma.promotion.findUnique({ where: { id } });
  if (!promo) throw new Error("Promotion not found");
  await prisma.$transaction(async (tx) => {
    await tx.promotion.update({ where: { id }, data: { active } });
    await tx.auditLog.create({
      data: { actorId, action: "promotion.toggle", targetId: id, detail: `Promotion ${promo.name} ${active ? "activated" : "paused"}` },
    });
  });
  return { id, active };
}

/** One credit, atomically: wallet + PromotionGrant + BalanceAdjustment
 *  (kind "bonus") + AuditLog. `day` is the cashback loss day, "" else. */
async function grantPromotion(
  tx: Tx,
  opts: {
    promotion: { id: string; name: string; type: string; createdBy: string };
    userId: string;
    userName: string;
    amount: number;
    wallet: "cash" | "coins";
    day: string;
    auditAction: "promotion.grant" | "promotion.cashback";
  },
) {
  const fresh = await tx.user.findUnique({ where: { id: opts.userId } });
  if (!fresh) throw new Error("User not found");
  if (opts.wallet === "cash") {
    await tx.user.update({ where: { id: opts.userId }, data: { cashBalance: round2(dec(fresh.cashBalance) + opts.amount) } });
  } else {
    await tx.user.update({ where: { id: opts.userId }, data: { coins: fresh.coins + Math.round(opts.amount) } });
  }
  const label = opts.wallet === "cash" ? `GH₵ ${round2(opts.amount).toFixed(2)}` : `${Math.round(opts.amount)} coins`;
  await tx.promotionGrant.create({
    data: { promotionId: opts.promotion.id, userId: opts.userId, amount: round2(opts.amount), wallet: opts.wallet, day: opts.day },
  });
  await tx.balanceAdjustment.create({
    data: {
      userId: opts.userId,
      adminId: opts.promotion.createdBy,
      wallet: opts.wallet,
      direction: "credit",
      amount: round2(opts.amount),
      reason: `Promotion: ${opts.promotion.name}`,
      kind: "bonus",
    },
  });
  await tx.auditLog.create({
    data: {
      actorId: opts.promotion.createdBy,
      action: opts.auditAction,
      targetId: opts.userId,
      detail: `Promotion ${opts.promotion.name}: granted ${label} to ${opts.userName}${opts.day ? ` (cashback for ${opts.day})` : ""}`,
    },
  });
}

async function alreadyGranted(tx: Tx, promotionId: string, userId: string, day?: string): Promise<boolean> {
  const row = await tx.promotionGrant.findFirst({
    where: day ? { promotionId, userId, day } : { promotionId, userId },
    select: { id: true },
  });
  return !!row;
}

/**
 * Deposit-time promotions, called INSIDE the deposit transaction after
 * the DepositEvent lands: deposit_match (a % of this deposit, capped,
 * once per player per promotion) and free_coins with trigger
 * "first_deposit". Returns the grants made, so the deposit response can
 * name them.
 */
export async function applyDepositPromotions(
  tx: Tx,
  userId: string,
  userName: string,
  depositAmount: number,
  referredByAdminId: string | null,
): Promise<{ promotionId: string; name: string; amount: number; wallet: "cash" | "coins" }[]> {
  const granted: { promotionId: string; name: string; amount: number; wallet: "cash" | "coins" }[] = [];
  const now = new Date();
  const depositCount = await tx.depositEvent.count({ where: { userId } });
  const isFirstDeposit = depositCount <= 1; // this deposit just landed
  const promos = await tx.promotion.findMany({
    where: { type: { in: ["deposit_match", "free_coins"] } },
    orderBy: { createdAt: "asc" },
  });
  for (const p of promos) {
    if (!isLive(p, now) || !targetMatches(p, referredByAdminId)) continue;
    if (await alreadyGranted(tx, p.id, userId)) continue;
    if (p.type === "deposit_match") {
      const match = round2(Math.min((depositAmount * dec(p.percent)) / 100, p.cap == null ? Infinity : dec(p.cap)));
      if (match <= 0) continue;
      await grantPromotion(tx, {
        promotion: p, userId, userName, amount: match, wallet: "cash", day: "", auditAction: "promotion.grant",
      });
      granted.push({ promotionId: p.id, name: p.name, amount: match, wallet: "cash" });
    } else if (p.type === "free_coins" && p.trigger === "first_deposit" && isFirstDeposit && p.coinAmount) {
      await grantPromotion(tx, {
        promotion: p, userId, userName, amount: p.coinAmount, wallet: "coins", day: "", auditAction: "promotion.grant",
      });
      granted.push({ promotionId: p.id, name: p.name, amount: p.coinAmount, wallet: "coins" });
    }
  }
  return granted;
}

/** Signup-time free coins: called INSIDE the register transaction. */
export async function applyFreeCoinsSignup(
  tx: Tx,
  userId: string,
  userName: string,
  referredByAdminId: string | null,
): Promise<{ promotionId: string; name: string; amount: number }[]> {
  const granted: { promotionId: string; name: string; amount: number }[] = [];
  const now = new Date();
  const promos = await tx.promotion.findMany({
    where: { type: "free_coins", trigger: "signup" },
    orderBy: { createdAt: "asc" },
  });
  for (const p of promos) {
    if (!isLive(p, now) || !targetMatches(p, referredByAdminId)) continue;
    if (!p.coinAmount) continue;
    await grantPromotion(tx, {
      promotion: p, userId, userName, amount: p.coinAmount, wallet: "coins", day: "", auditAction: "promotion.grant",
    });
    granted.push({ promotionId: p.id, name: p.name, amount: p.coinAmount });
  }
  return granted;
}

/**
 * MANUAL cashback: the owner pays one cashback promotion for one day.
 * Each eligible player's net cash loss that day (stakes − payouts on
 * cash games, UTC day) earns `percent`%, capped at `cap`. One grant per
 * player per promotion per day — paying the same day twice grants
 * nothing new. The promotion need not be `active` to pay: the DATE
 * must fall inside its [startAt, endAt] window.
 */
export async function payCashback(
  promotionId: string,
  date: string,
  actorId: string,
): Promise<{ promotionId: string; date: string; paid: number; total: number; players: { userId: string; name: string; netLoss: number; granted: number }[] }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Date must be YYYY-MM-DD");
  const promo = await prisma.promotion.findUnique({ where: { id: promotionId } });
  if (!promo) throw new Error("Promotion not found");
  if (promo.type !== "cashback") throw new Error("Only a cashback promotion can pay cashback");
  const startDay = promo.startAt.toISOString().slice(0, 10);
  const endDay = promo.endAt ? promo.endAt.toISOString().slice(0, 10) : null;
  if (date < startDay || (endDay && date > endDay)) {
    throw new Error(`That date is outside the promotion window (${startDay} to ${endDay ?? "open"})`);
  }
  const from = new Date(`${date}T00:00:00Z`);
  const to = new Date(`${date}T23:59:59.999Z`);
  const groups = await prisma.gameResult.groupBy({
    by: ["userId"],
    where: { currency: "cash", createdAt: { gte: from, lte: to } },
    _sum: { stake: true, payout: true },
  });
  const users = await prisma.user.findMany({
    where: { id: { in: groups.map((g) => g.userId) } },
    select: { id: true, name: true, referredByAdminId: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));
  const result = await prisma.$transaction(async (tx) => {
    const paid: { userId: string; name: string; netLoss: number; granted: number }[] = [];
    let total = 0;
    for (const g of groups) {
      const u = userById.get(g.userId);
      if (!u) continue;
      if (!targetMatches(promo, u.referredByAdminId)) continue;
      const netLoss = round2(dec(g._sum.stake) - dec(g._sum.payout));
      if (netLoss <= 0) continue;
      const grant = round2(Math.min((netLoss * dec(promo.percent)) / 100, promo.cap == null ? Infinity : dec(promo.cap)));
      if (grant <= 0) continue;
      if (await alreadyGranted(tx, promo.id, u.id, date)) continue;
      await grantPromotion(tx, {
        promotion: promo, userId: u.id, userName: u.name, amount: grant, wallet: "cash", day: date, auditAction: "promotion.cashback",
      });
      paid.push({ userId: u.id, name: u.name, netLoss, granted: grant });
      total = round2(total + grant);
    }
    return { paid, total };
  });
  return { promotionId, date, paid: result.paid.length, total: result.total, players: result.paid };
}
