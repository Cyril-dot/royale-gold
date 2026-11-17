// P1 Batch 2 (A22): reports & export — CSV downloads + on-screen
// previews, generated from REAL tables. Every report is scoped: an
// admin sees only their own downline (users they referred); the owner
// sees everything (or one admin's downline in preview). The same row
// builders serve the admin and owner routes, and the CSV and JSON
// preview shapes, so the download and the preview can never disagree.
//
// Reports:
//   deposits    — date, player, amount, method, referring admin, commission
//   players     — name, contact, joined, total deposited, total staked,
//                 total won (payouts), commission (stamped sum)
//   withdrawals — date, player, amount, method, status, risk flags
//
// The players report is all-time per player; deposits/withdrawals take
// a ?from=&to= date range (UTC, default last 30 days).

import { prisma } from "./prisma";
import { dec } from "./money";
import { symbolFor } from "./country";
import { annotateWithdrawalFlags, WITHDRAWAL_RISK_LABELS } from "./withdrawals";

/** The user ids a report may include: the admin's downline, or every
 *  user when adminId is null (owner-global). */
export async function reportUserIds(adminId: string | null): Promise<string[]> {
  if (!adminId) {
    const all = await prisma.user.findMany({ select: { id: true } });
    return all.map((u) => u.id);
  }
  const downline = await prisma.user.findMany({
    where: { referredByAdminId: adminId },
    select: { id: true },
  });
  return downline.map((u) => u.id);
}

/** ?from=&to= range (UTC dates). Default: last 30 days through today. */
export function parseReportRange(sp: URLSearchParams): { from: Date; to: Date; fromStr: string; toStr: string } {
  const isDate = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const today = new Date().toISOString().slice(0, 10);
  const thirtyAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const fromStr = isDate(sp.get("from")) ? (sp.get("from") as string) : thirtyAgo;
  const toStr = isDate(sp.get("to")) ? (sp.get("to") as string) : today;
  const from = new Date(`${fromStr}T00:00:00Z`);
  const to = new Date(`${toStr}T23:59:59Z`);
  return { from, to, fromStr, toStr };
}

export interface DepositReportRow {
  date: string;
  player: string;
  contact: string;
  amount: number;
  method: string;
  referringAdmin: string;
  commission: number;
  // Phase 1 country-based (Nov 2026): the fiat this row is in.
  fiatCurrency: string;
}

export async function depositsReport(userIds: string[], from: Date, to: Date, fiatCurrency: string = "GHS"): Promise<DepositReportRow[]> {
  if (userIds.length === 0) return [];
  const rows = await prisma.depositEvent.findMany({
    where: { userId: { in: userIds }, fiatCurrency, createdAt: { gte: from, lte: to } },
    include: {
      user: { select: { name: true, email: true, phone: true } },
      admin: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((d) => ({
    date: d.createdAt.toISOString().slice(0, 10),
    player: d.user.name,
    contact: d.user.email ?? d.user.phone ?? "",
    amount: dec(d.amount),
    method: d.method,
    referringAdmin: d.admin?.name ?? "—",
    commission: dec(d.commission),
    fiatCurrency: d.fiatCurrency ?? "GHS",
  }));
}

export interface PlayerReportRow {
  name: string;
  contact: string;
  joined: string;
  totalDeposited: number;
  totalStaked: number;
  totalWon: number;
  commission: number;
  // Phase 1 country-based (Nov 2026): the player's fiat.
  fiatCurrency: string;
}

export async function playersReport(userIds: string[], fiatCurrency: string = "GHS"): Promise<PlayerReportRow[]> {
  if (userIds.length === 0) return [];
  const [users, deposits, rounds] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds }, currency: fiatCurrency },
      select: { id: true, name: true, email: true, phone: true, createdAt: true, currency: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.depositEvent.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, fiatCurrency },
      _sum: { amount: true, commission: true },
    }),
    // Total staked + total won (payouts) per player, all games.
    prisma.gameResult.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, currency: "cash", fiatCurrency },
      _sum: { stake: true, payout: true },
    }),
  ]);
  const depByUser = new Map(deposits.map((d) => [d.userId, d]));
  const roundsByUser = new Map(rounds.map((r) => [r.userId, r]));
  return users.map((u) => {
    const d = depByUser.get(u.id);
    const r = roundsByUser.get(u.id);
    return {
      name: u.name,
      contact: u.email ?? u.phone ?? "",
      joined: u.createdAt.toISOString().slice(0, 10),
      totalDeposited: Number(d?._sum.amount ?? 0),
      totalStaked: Number(r?._sum.stake ?? 0),
      totalWon: Number(r?._sum.payout ?? 0),
      // Stamped commission sum — the same figure as the player detail's
      // Totals "Commission" tile (the rules-engine figure lives on the
      // Commission page, which is the source of truth).
      commission: Number(d?._sum.commission ?? 0),
      fiatCurrency: u.currency ?? "GHS",
    };
  });
}

export interface WithdrawalReportRow {
  date: string;
  player: string;
  contact: string;
  amount: number;
  method: string;
  status: string;
  flags: string;
  // Phase 1 country-based (Nov 2026): the fiat this row is in.
  fiatCurrency: string;
}

export async function withdrawalsReport(userIds: string[], from: Date, to: Date, fiatCurrency: string = "GHS"): Promise<WithdrawalReportRow[]> {
  if (userIds.length === 0) return [];
  const rows = await prisma.withdrawal.findMany({
    where: { userId: { in: userIds }, fiatCurrency, createdAt: { gte: from, lte: to } },
    include: { user: { select: { id: true, name: true, email: true, phone: true, createdAt: true } } },
    orderBy: { createdAt: "desc" },
  });
  const flags = await annotateWithdrawalFlags(rows.map((w) => ({ id: w.id, userId: w.userId, amount: dec(w.amount), user: w.user })));
  return rows.map((w) => ({
    date: w.createdAt.toISOString().slice(0, 10),
    player: w.user.name,
    contact: w.user.email ?? w.user.phone ?? "",
    amount: dec(w.amount),
    method: w.method,
    status: w.status,
    // The display labels, not the keys — the same words as the Money queue.
    flags: (flags.get(w.id) ?? []).map((f) => WITHDRAWAL_RISK_LABELS[f]).join(", "),
    fiatCurrency: w.fiatCurrency ?? "GHS",
  }));
}

/** Minimal CSV: quote a field when it holds a comma, quote or newline. */
export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export type ReportKind = "deposits" | "players" | "withdrawals";

/**
 * One handler for a report route: ?preview=1 returns JSON (the first
 * 10 rows + the total, for the on-screen preview); otherwise the full
 * report downloads as a CSV. The admin and owner routes differ only
 * in how the user ids are scoped — the rows are built the same way.
 */
export async function serveReport(kind: ReportKind, sp: URLSearchParams, userIds: string[]): Promise<Response> {
  const preview = sp.get("preview") === "1";
  // Phase 1 country-based (Nov 2026): reports are per-fiat — ?currency=
  // (default GHS). Amounts in a report are all in this one fiat.
  const currency = (sp.get("currency") || "GHS").toUpperCase();
  const sym = symbolFor(currency);
  const { from, to, fromStr, toStr } = parseReportRange(sp);
  if (kind === "deposits") {
    const rows = await depositsReport(userIds, from, to, currency);
    if (preview) return Response.json({ report: kind, currency, from: fromStr, to: toStr, total: rows.length, rows: rows.slice(0, 10) });
    const csv = toCsv(
      ["Date", "Player", "Contact", `Amount (${sym})`, "Method", "Referring admin", `Commission (${sym})`],
      rows.map((r) => [r.date, r.player, r.contact, r.amount.toFixed(2), r.method, r.referringAdmin, r.commission.toFixed(2)]),
    );
    return csvResponse(`royale-gold-deposits-${currency}-${fromStr}_to_${toStr}.csv`, csv);
  }
  if (kind === "players") {
    const rows = await playersReport(userIds, currency);
    if (preview) return Response.json({ report: kind, currency, total: rows.length, rows: rows.slice(0, 10) });
    const csv = toCsv(
      ["Player", "Contact", "Joined", `Total deposited (${sym})`, `Total staked (${sym})`, `Total won (${sym})`, `Commission (${sym})`],
      rows.map((r) => [r.name, r.contact, r.joined, r.totalDeposited.toFixed(2), r.totalStaked.toFixed(2), r.totalWon.toFixed(2), r.commission.toFixed(2)]),
    );
    return csvResponse(`royale-gold-players-${currency}-${toStr}.csv`, csv);
  }
  const rows = await withdrawalsReport(userIds, from, to, currency);
  if (preview) return Response.json({ report: kind, currency, from: fromStr, to: toStr, total: rows.length, rows: rows.slice(0, 10) });
  const csv = toCsv(
    ["Date", "Player", "Contact", `Amount (${sym})`, "Method", "Status", "Risk flags"],
    rows.map((r) => [r.date, r.player, r.contact, r.amount.toFixed(2), r.method, r.status, r.flags]),
  );
  return csvResponse(`royale-gold-withdrawals-${currency}-${fromStr}_to_${toStr}.csv`, csv);
}
