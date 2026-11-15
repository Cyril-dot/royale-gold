// P0 Batch 1 — the transaction ledger (A6 admin own-scope, O7 owner
// global). One merged, newest-first list of every money movement, built
// ONLY from rows the tables actually hold — no numbers are invented:
//   deposit    — DepositEvent (cash in, method, commission)
//   bet        — GameResult (one row per round: stake out, payout in, net)
//   withdrawal — Withdrawal (cash out request, with its status)
//   adjustment — BalanceAdjustment (admin credit/debit, with reason)
//   conversion — ConversionEvent (cash out -> coins in)
// Scope: adminId set = that admin's downline only; null = platform-wide
// (owner). Filters are applied after the merge (the sources live in
// different tables), then the list is cut to `limit`.

import { prisma } from "./prisma";
import { dec } from "./money";
import { getGame } from "./games";

export type LedgerType = "deposit" | "bet" | "withdrawal" | "adjustment" | "conversion" | "payout";

export interface LedgerRow {
  id: string;
  type: LedgerType;
  userId: string;
  userName: string;
  userContact: string | null;
  adminId: string | null;
  adminName: string | null;
  // Signed amount in the row's wallet: + means money in to the player,
  // - means money out of the player. For a bet row this is the NET
  // (payout - stake); stake and payout are shown separately too.
  amount: number;
  wallet: "cash" | "coins";
  detail: string;
  stake?: number;
  payout?: number;
  method?: string;
  status?: string;
  reason?: string;
  createdAt: string;
}

export interface LedgerFilters {
  type?: LedgerType;
  q?: string;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  adminId?: string; // owner only: narrow to one admin's downline
  method?: string;
  minAmount?: number;
  maxAmount?: number;
  userId?: string;
  limit?: number;
}

function inRange(d: Date, from?: Date, to?: Date): boolean {
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

export async function buildLedger(opts: {
  scopeAdminId: string | null; // admin id for own-scope, null for owner-global
  filters?: LedgerFilters;
}): Promise<{ rows: LedgerRow[]; totals: { rows: number; cashIn: number; cashOut: number } }> {
  const f = opts.filters ?? {};
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 100);
  const from = f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from) ? new Date(`${f.from}T00:00:00.000Z`) : undefined;
  const to = f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to) ? new Date(`${f.to}T23:59:59.999Z`) : undefined;
  const needle = (f.q ?? "").trim().toLowerCase();

  // Scope: an admin sees only users they referred. The owner sees all.
  // DepositEvent.adminId and Withdrawal.adminId are stamped at creation;
  // for game rounds / conversions / adjustments the scope is the user's
  // referredByAdminId (or the row's adminId where one exists).
  const scopeWhere = opts.scopeAdminId
    ? { referredByAdminId: opts.scopeAdminId }
    : f.adminId
      ? { referredByAdminId: f.adminId }
      : {};
  const scopedUsers = await prisma.user.findMany({
    where: scopeWhere,
    select: { id: true, name: true, email: true, phone: true, referredByAdminId: true },
  });
  const userById = new Map(scopedUsers.map((u) => [u.id, u]));
  const scopedIds = scopedUsers.map((u) => u.id);
  // User filter shared by the user-scoped sources (game rounds, conversions).
  // When the scope is an admin (or one admin is picked) and that admin has
  // NO referred users, the filter must match nothing — never fall through
  // to an unfiltered query, or an admin would see every player's rounds.
  const userFilter = f.userId
    ? { userId: f.userId }
    : opts.scopeAdminId || f.adminId
      ? { userId: { in: scopedIds.length > 0 ? scopedIds : ["__none__"] } }
      : {};
  const adminIds = [...new Set(scopedUsers.map((u) => u.referredByAdminId).filter((x): x is string => !!x))];
  const adminById = new Map<string, string>();
  if (adminIds.length > 0) {
    const admins = await prisma.user.findMany({ where: { id: { in: adminIds } }, select: { id: true, name: true } });
    for (const a of admins) adminById.set(a.id, a.name);
  }

  const matchesText = (name: string, contact: string | null) =>
    !needle || `${name} ${contact ?? ""}`.toLowerCase().includes(needle);
  const matchesAmount = (amount: number) =>
    (f.minAmount === undefined || Math.abs(amount) >= f.minAmount) &&
    (f.maxAmount === undefined || Math.abs(amount) <= f.maxAmount);

  const rows: LedgerRow[] = [];

  // --- Deposits (cash in) ---
  if (!f.type || f.type === "deposit") {
    const deposits = await prisma.depositEvent.findMany({
      where: {
        ...(opts.scopeAdminId ? { adminId: opts.scopeAdminId } : f.adminId ? { adminId: f.adminId } : {}),
        ...(f.method ? { method: f.method } : {}),
        ...userFilter,
        createdAt: { gte: from, lte: to },
      },
      include: { user: { select: { id: true, name: true, email: true, phone: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    for (const d of deposits) {
      const amount = dec(d.amount);
      if (!matchesAmount(amount)) continue;
      if (!matchesText(d.user.name, d.user.email ?? d.user.phone ?? null)) continue;
      rows.push({
        id: `dep-${d.id}`, type: "deposit", userId: d.userId, userName: d.user.name,
        userContact: d.user.email ?? d.user.phone ?? null, adminId: d.adminId,
        adminName: d.adminId ? adminById.get(d.adminId) ?? null : null,
        amount, wallet: "cash", detail: `Deposit via ${d.method} · commission ${dec(d.commission)} (${dec(d.pctInForce)}%)`,
        method: d.method, createdAt: d.createdAt.toISOString(),
      });
    }
  }

  // --- Game rounds (one row per round: net = payout - stake) ---
  if (!f.type || f.type === "bet") {
    const results = await prisma.gameResult.findMany({
      where: {
        ...userFilter,
        createdAt: { gte: from, lte: to },
      },
      include: { user: { select: { id: true, name: true, email: true, phone: true, referredByAdminId: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    for (const r of results) {
      const stake = dec(r.stake);
      const payout = dec(r.payout);
      const net = Math.round((payout - stake) * 100) / 100;
      if (!matchesAmount(net)) continue;
      if (!matchesText(r.user.name, r.user.email ?? r.user.phone ?? null)) continue;
      const gameName = getGame(r.game)?.name || r.game;
      rows.push({
        id: `bet-${r.id}`, type: "bet", userId: r.userId, userName: r.user.name,
        userContact: r.user.email ?? r.user.phone ?? null, adminId: r.user.referredByAdminId,
        adminName: r.user.referredByAdminId ? adminById.get(r.user.referredByAdminId) ?? null : null,
        amount: net, wallet: r.currency === "coins" ? "coins" : "cash",
        detail: `${gameName} · ${r.currency === "coins" ? "coins" : "cash"}`,
        stake, payout, createdAt: r.createdAt.toISOString(),
      });
    }
  }

  // --- Withdrawal requests (cash out request, with status) ---
  if (!f.type || f.type === "withdrawal") {
    const withdrawals = await prisma.withdrawal.findMany({
      where: {
        ...(opts.scopeAdminId ? { adminId: opts.scopeAdminId } : f.adminId ? { adminId: f.adminId } : {}),
        ...(f.method ? { method: f.method } : {}),
        ...userFilter,
        createdAt: { gte: from, lte: to },
      },
      include: { user: { select: { id: true, name: true, email: true, phone: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    for (const w of withdrawals) {
      const amount = dec(w.amount);
      if (!matchesAmount(amount)) continue;
      if (!matchesText(w.user.name, w.user.email ?? w.user.phone ?? null)) continue;
      rows.push({
        id: `wd-${w.id}`, type: "withdrawal", userId: w.userId, userName: w.user.name,
        userContact: w.user.email ?? w.user.phone ?? null, adminId: w.adminId,
        adminName: w.adminId ? adminById.get(w.adminId) ?? null : null,
        amount: -amount, wallet: "cash", detail: `Withdrawal request via ${w.method}`,
        method: w.method, status: w.status, reason: w.reason ?? undefined,
        createdAt: w.createdAt.toISOString(),
      });
    }
  }

  // --- Manual balance adjustments (admin credit/debit, with reason) ---
  if (!f.type || f.type === "adjustment") {
    const adjustments = await prisma.balanceAdjustment.findMany({
      where: {
        ...(opts.scopeAdminId ? { adminId: opts.scopeAdminId } : f.adminId ? { adminId: f.adminId } : {}),
        ...userFilter,
        createdAt: { gte: from, lte: to },
      },
      include: { user: { select: { id: true, name: true, email: true, phone: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    for (const a of adjustments) {
      const amount = dec(a.amount);
      if (!matchesAmount(amount)) continue;
      if (!matchesText(a.user.name, a.user.email ?? a.user.phone ?? null)) continue;
      rows.push({
        id: `adj-${a.id}`, type: "adjustment", userId: a.userId, userName: a.user.name,
        userContact: a.user.email ?? a.user.phone ?? null, adminId: a.adminId,
        adminName: adminById.get(a.adminId) ?? null,
        amount: a.direction === "credit" ? amount : -amount,
        wallet: a.wallet === "coins" ? "coins" : "cash",
        // P1 Batch 1 (A17/A18): a bonus grant or a promo redemption is a
        // BalanceAdjustment too, but the ledger names it so it is never
        // mistaken for a manual adjustment.
        detail: a.kind === "bonus" ? `Bonus ${a.direction} (${a.wallet})` : a.kind === "promo" ? `Promo credit (${a.wallet})` : a.kind === "cashout" ? `Tetris line cash-out (${a.wallet})` : `Manual ${a.direction} (${a.wallet})`,
        reason: a.reason, createdAt: a.createdAt.toISOString(),
      });
    }
  }

  // --- Conversions (cash out -> coins in; one row, cash side) ---
  if (!f.type || f.type === "conversion") {
    const conversions = await prisma.conversionEvent.findMany({
      where: {
        ...userFilter,
        createdAt: { gte: from, lte: to },
      },
      include: { user: { select: { id: true, name: true, email: true, phone: true, referredByAdminId: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    for (const c of conversions) {
      const amount = dec(c.cashDebited);
      if (!matchesAmount(amount)) continue;
      if (!matchesText(c.user.name, c.user.email ?? c.user.phone ?? null)) continue;
      rows.push({
        id: `conv-${c.id}`, type: "conversion", userId: c.userId, userName: c.user.name,
        userContact: c.user.email ?? c.user.phone ?? null, adminId: c.user.referredByAdminId,
        adminName: c.user.referredByAdminId ? adminById.get(c.user.referredByAdminId) ?? null : null,
        amount: -amount, wallet: "cash",
        detail: `Converted ${dec(c.cashDebited)} cash -> ${c.coinsGained} coins`,
        createdAt: c.createdAt.toISOString(),
      });
    }
  }

  // --- Commission payouts (P0 Batch 3 O5: cash out of the platform to an
  // admin, recorded by the owner at settlement). The "user" of a payout
  // row is the admin being paid. An admin's own-scope ledger shows only
  // payouts to THEM; the owner's global ledger shows all of them.
  if (!f.type || f.type === "payout") {
    const payoutAdminId = opts.scopeAdminId ?? f.adminId ?? undefined;
    const payouts = await prisma.commissionPayout.findMany({
      where: {
        ...(payoutAdminId ? { adminId: payoutAdminId } : {}),
        createdAt: { gte: from, lte: to },
      },
      include: { admin: { select: { id: true, name: true, email: true, phone: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    for (const p of payouts) {
      const amount = dec(p.amount);
      if (!matchesAmount(amount)) continue;
      if (!matchesText(p.admin.name, p.admin.email ?? p.admin.phone ?? null)) continue;
      rows.push({
        id: `pay-${p.id}`, type: "payout", userId: p.adminId, userName: p.admin.name,
        userContact: p.admin.email ?? p.admin.phone ?? null, adminId: p.adminId,
        adminName: p.admin.name,
        amount: -amount, wallet: "cash",
        detail: `Commission payout via ${p.method}${p.reference ? ` · ${p.reference}` : ""}`,
        method: p.method, createdAt: p.createdAt.toISOString(),
      });
    }
  }

  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const page = rows.slice(0, limit);
  const cashIn = rows.filter((r) => r.wallet === "cash" && r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const cashOut = rows.filter((r) => r.wallet === "cash" && r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0);
  return { rows: page, totals: { rows: rows.length, cashIn: Math.round(cashIn * 100) / 100, cashOut: Math.round(cashOut * 100) / 100 } };
}
