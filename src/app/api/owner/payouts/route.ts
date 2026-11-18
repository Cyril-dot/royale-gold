// Owner Payouts tab (Nov 2026) — the PEOPLE owed commission each day.
// GET ?day=YYYY-MM-DD&currency=GHS (default today): every admin owed
// that day with their amount + paid flag, the last-14-days strip, and
// each person's details (referral code + saved payout account) — one
// call per day selection, not one per row.
// POST { day, adminId, action, currency }: owner-only status actions.
// No money moves on GET. POST "paid" records a real CommissionPayout
// (the same table the Settlement form writes).
//
// HOW "PAID" IS DERIVED — CommissionPayout has NO status column, so
// paid-ness is derived from the payout records themselves, exactly as
// the Settlement page already does (paid = sum of CommissionPayout
// rows):
//   owed(day)  = dayCommissions for that admin+day (rules engine +
//                legacy fallback — the same calc as the Commission
//                per-day viewer).
//   paid(day)  = sum of CommissionPayout rows (amount > 0) whose
//                recorded period covers the day (periodFrom <= day <=
//                periodTo); a payout with no period counts on the day
//                it was recorded (createdAt day).
//   status     = PAID when paid >= owed; REJECTED when a "rejected"
//                marker row covers the day and it is not paid; else
//                UNPAID.
// REJECTED is stored as a zero-amount marker row (method "rejected",
// amount 0, period = the day, reference "Payouts tab"). It adds 0 to
// every paid total, so settlement / P&L / cashier figures are
// untouched — but it does appear as a zero-amount row in the ledger
// ("Commission payout via rejected"). A dedicated status column on
// CommissionPayout would be the cleaner long-term fix; this round was
// briefed to use the existing fields only, no migration.
// "paid" records a payout for the REMAINDER owed (owed − already
// paid), method "cash" (the tab does not ask for a method — the
// owner can correct it in Settlement), period = the day, reference
// "Payouts tab", audit-logged as "commission.payout" like Settlement.
// "unpaid" reverses ONLY the rows this tab created for that day
// (reference "Payouts tab", single-day period) — a day paid via the
// Settlement form cannot be unmarked from this tab (400, "Paid via
// Settlement — reverse it there"). Reversals are audit-logged.
// Day = UTC calendar day, the same day logic as the Commission
// per-day viewer. Strip rule: green only when every person owed that
// day is Paid; gold when anyone is Unpaid or Rejected; plain when
// nobody is owed.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dateStr, dec, round2, todayStr } from "@/lib/money";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { dayCommissions } from "@/lib/commission";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TAB_REF = "Payouts tab";

type PayoutRow = {
  id: string;
  amount: number;
  method: string;
  reference: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  createdAt: Date;
};

function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return dateStr(d);
}

/** Does this payout row count for this day? Period rows count for
 * every day their period covers; a row with no period counts on the
 * day it was recorded. */
function coversDay(p: Pick<PayoutRow, "method" | "periodFrom" | "periodTo" | "createdAt">, day: string): boolean {
  if (p.periodFrom && p.periodTo) return p.periodFrom <= day && day <= p.periodTo;
  if (p.periodFrom && !p.periodTo) return p.periodFrom <= day;
  if (!p.periodFrom && p.periodTo) return day <= p.periodTo;
  return dateStr(new Date(p.createdAt)) === day;
}

function paidForDay(rows: PayoutRow[], day: string): { paid: number; paidAt: string | null } {
  const covering = rows.filter((r) => dec(r.amount) > 0 && coversDay(r, day));
  return {
    paid: round2(covering.reduce((s, r) => s + dec(r.amount), 0)),
    paidAt:
      covering.length === 0
        ? null
        : new Date(Math.max(...covering.map((r) => new Date(r.createdAt).getTime()))).toISOString(),
  };
}

function rejectedForDay(rows: PayoutRow[], day: string): boolean {
  return rows.some((r) => r.method === "rejected" && coversDay(r, day));
}

export async function GET(req: Request) {
  try {
    await requireRole("owner");
    const sp = new URL(req.url).searchParams;
    const day = sp.get("day") || todayStr();
    if (!DAY_RE.test(day)) return fail("day must be YYYY-MM-DD");
    const fiatCurrency = (sp.get("currency") || "GHS").toUpperCase();
    const today = todayStr();
    const stripStart = addDays(today, -13);
    // Phase 3: optional calendar window (?from=&to=, max 62 days,
    // default the current month) and per-admin payout history
    // (?adminId=, latest 30 rows). Both are additive — callers that
    // pass neither get exactly the old payload plus `calendar`.
    const fromParam = sp.get("from");
    const toParam = sp.get("to");
    let calFrom = fromParam && DAY_RE.test(fromParam) ? fromParam : `${today.slice(0, 8)}01`;
    let calTo = toParam && DAY_RE.test(toParam) ? toParam : today;
    if (calFrom > calTo) {
      const t = calFrom;
      calFrom = calTo;
      calTo = t;
    }
    const spanDays =
      Math.round(
        (new Date(`${calTo}T00:00:00Z`).getTime() - new Date(`${calFrom}T00:00:00Z`).getTime()) / 86400000,
      ) + 1;
    if (spanDays > 62) return fail("Calendar range must be 62 days or fewer");
    const adminIdParam = sp.get("adminId") || undefined;

    const admins = await prisma.user.findMany({
      where: { role: "admin" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, phone: true, active: true },
    });
    // All payouts in this fiat (owner-recorded rows only — small table);
    // per-day paid/rejected is derived in code from period/createdAt.
    const allPayouts = await prisma.commissionPayout.findMany({
      where: { fiatCurrency },
      select: { id: true, adminId: true, amount: true, method: true, reference: true, periodFrom: true, periodTo: true, createdAt: true },
    });
    const byAdmin = new Map<string, PayoutRow[]>();
    for (const p of allPayouts) {
      const row: PayoutRow = {
        id: p.id,
        amount: dec(p.amount),
        method: p.method,
        reference: p.reference,
        periodFrom: p.periodFrom,
        periodTo: p.periodTo,
        createdAt: p.createdAt,
      };
      const list = byAdmin.get(p.adminId) ?? [];
      list.push(row);
      byAdmin.set(p.adminId, list);
    }

    // Owed per admin per day, from the same rules-engine calc as the
    // Commission viewer (one dayCommissions call per admin covers the
    // union of the 14-day strip and the calendar window).
    const rangeStart = stripStart < calFrom ? stripStart : calFrom;
    const rangeEnd = today > calTo ? today : calTo;
    const owedByAdminDay = new Map<string, Map<string, number>>();
    for (const a of admins) {
      const days = await dayCommissions(a.id, rangeStart, rangeEnd, fiatCurrency);
      const m = new Map<string, number>();
      for (const d of days) m.set(d.date, round2(d.totalCommission));
      owedByAdminDay.set(a.id, m);
    }

    const stripDates: string[] = [];
    for (let i = 13; i >= 0; i--) stripDates.push(addDays(today, -i));
    const days = stripDates.map((d) => {
      const owedAdmins = admins.filter((a) => (owedByAdminDay.get(a.id)?.get(d) ?? 0) > 0);
      const hasOwed = owedAdmins.length > 0;
      const allPaid =
        hasOwed &&
        owedAdmins.every((a) => {
          const owed = owedByAdminDay.get(a.id)?.get(d) ?? 0;
          return paidForDay(byAdmin.get(a.id) ?? [], d).paid >= owed;
        });
      return { date: d, hasOwed, allPaid };
    });

    // Calendar window (Phase 3): one summary per day in the requested
    // range, same owed/paid rule as the strip. The page renders it as a
    // month grid (or a list) beyond the 14-day strip.
    const calDates: string[] = [];
    for (let d = calFrom; d <= calTo; d = addDays(d, 1)) calDates.push(d);
    const calendar = calDates.map((d) => {
      const owedAdmins = admins.filter((a) => (owedByAdminDay.get(a.id)?.get(d) ?? 0) > 0);
      const hasOwed = owedAdmins.length > 0;
      const owed = round2(owedAdmins.reduce((s, a) => s + (owedByAdminDay.get(a.id)?.get(d) ?? 0), 0));
      const paid = round2(owedAdmins.reduce((s, a) => s + paidForDay(byAdmin.get(a.id) ?? [], d).paid, 0));
      const allPaid =
        hasOwed &&
        owedAdmins.every((a) => paidForDay(byAdmin.get(a.id) ?? [], d).paid >= (owedByAdminDay.get(a.id)?.get(d) ?? 0));
      return { date: d, owed, paid, people: owedAdmins.length, allPaid, hasOwed };
    });

    // Per-admin payout history (Phase 3, only when ?adminId= is passed):
    // the latest CommissionPayout rows for that admin in this fiat —
    // the commission-center view in Payouts Details.
    const historyRows = adminIdParam
      ? await prisma.commissionPayout.findMany({
          where: { adminId: adminIdParam, fiatCurrency },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: {
            id: true,
            amount: true,
            method: true,
            reference: true,
            periodFrom: true,
            periodTo: true,
            createdAt: true,
          },
        })
      : [];

    // People owed on the selected day (owed > 0 only).
    const owedIds = admins.filter((a) => (owedByAdminDay.get(a.id)?.get(day) ?? 0) > 0).map((a) => a.id);
    const [codes, accounts] = await Promise.all([
      owedIds.length === 0
        ? []
        : prisma.referralCode.findMany({
            where: { adminId: { in: owedIds }, active: true },
            orderBy: { createdAt: "asc" },
            select: { adminId: true, code: true },
          }),
      owedIds.length === 0
        ? []
        : prisma.withdrawalAccount.findMany({
            where: { userId: { in: owedIds } },
            select: { userId: true, type: true, bankName: true, accountNumber: true, network: true, phoneNumber: true, accountName: true },
          }),
    ]);
    const codeByAdmin = new Map(codes.map((c) => [c.adminId, c.code]));
    const accountByAdmin = new Map(accounts.map((a) => [a.userId, a]));

    const people = admins
      .filter((a) => owedIds.includes(a.id))
      .map((a) => {
        const owed = owedByAdminDay.get(a.id)?.get(day) ?? 0;
        const rows = byAdmin.get(a.id) ?? [];
        const { paid, paidAt } = paidForDay(rows, day);
        const rejected = rejectedForDay(rows, day);
        const status = paid >= owed ? "paid" : rejected ? "rejected" : "unpaid";
        return {
          adminId: a.id,
          adminName: a.name,
          adminEmail: a.email,
          adminPhone: a.phone,
          active: a.active,
          referralCode: codeByAdmin.get(a.id) ?? null,
          owed,
          paid,
          paidAt,
          status,
          account: accountByAdmin.get(a.id) ?? null,
        };
      });

    const totals = {
      owed: round2(people.reduce((s, p) => s + p.owed, 0)),
      paid: round2(people.reduce((s, p) => s + p.paid, 0)),
      unpaid: people.filter((p) => p.status === "unpaid").length,
      paidCount: people.filter((p) => p.status === "paid").length,
      rejectedCount: people.filter((p) => p.status === "rejected").length,
    };
    return ok({
      day,
      currency: fiatCurrency,
      people,
      days,
      totals,
      calendar: { from: calFrom, to: calTo, days: calendar },
      ...(adminIdParam
        ? {
            history: historyRows.map((r) => ({
              id: r.id,
              amount: dec(r.amount),
              method: r.method,
              reference: r.reference,
              periodFrom: r.periodFrom,
              periodTo: r.periodTo,
              createdAt: r.createdAt.toISOString(),
            })),
          }
        : {}),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const owner = await requireRole("owner");
    const body = await readJson<{ day?: string; adminId?: string; action?: string; currency?: string; reason?: string }>(req);
    if (!body) return fail("Invalid JSON body");
    // Phase 3: an optional reason for the rejected action — recorded in
    // the audit detail. Additive; callers that omit it behave as before.
    const reason = (body.reason ?? "").trim().slice(0, 200);
    const day = body.day ?? todayStr();
    if (!DAY_RE.test(day)) return fail("day must be YYYY-MM-DD");
    const adminId = (body.adminId ?? "").trim();
    if (!adminId) return fail("adminId is required");
    const action = body.action;
    if (action !== "paid" && action !== "unpaid" && action !== "rejected") {
      return fail("action must be paid, unpaid or rejected");
    }
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== "admin") return fail("Admin not found", 404);
    const fiatCurrency = ((body.currency || admin.currency || "GHS").toUpperCase());

    const days = await dayCommissions(adminId, day, day, fiatCurrency);
    const owed = round2(days[0]?.totalCommission ?? 0);
    if (owed <= 0) return fail("Nothing owed that day");
    const rows = await prisma.commissionPayout.findMany({
      where: { adminId, fiatCurrency },
      select: { id: true, amount: true, method: true, reference: true, periodFrom: true, periodTo: true, createdAt: true },
    });
    const typed: PayoutRow[] = rows.map((r) => ({
      id: r.id,
      amount: dec(r.amount),
      method: r.method,
      reference: r.reference,
      periodFrom: r.periodFrom,
      periodTo: r.periodTo,
      createdAt: r.createdAt,
    }));
    const { paid } = paidForDay(typed, day);
    const rejected = rejectedForDay(typed, day);

    if (action === "paid") {
      const remainder = round2(owed - paid);
      if (remainder <= 0) return fail("Already paid");
      const created = await prisma.$transaction(async (tx) => {
        const p = await tx.commissionPayout.create({
          data: {
            adminId,
            amount: remainder,
            method: "cash",
            fiatCurrency,
            reference: TAB_REF,
            periodFrom: day,
            periodTo: day,
            createdBy: owner.id,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: owner.id,
            action: "commission.payout",
            targetId: adminId,
            detail: `Paid ${admin.name} ${remainder.toFixed(2)} ${fiatCurrency} for ${day} via Payouts tab (cash)`,
          },
        });
        return p;
      });
      return ok({ ok: true, action, day, adminId, owed, paid: round2(paid + remainder), paidAt: created.createdAt.toISOString(), status: "paid" });
    }

    if (action === "rejected") {
      if (paid >= owed) return fail("Already paid — mark unpaid first");
      if (rejected) return fail("Already rejected");
      await prisma.$transaction(async (tx) => {
        await tx.commissionPayout.create({
          data: {
            adminId,
            amount: 0,
            method: "rejected",
            fiatCurrency,
            reference: TAB_REF,
            periodFrom: day,
            periodTo: day,
            createdBy: owner.id,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: owner.id,
            action: "commission.payout-rejected",
            targetId: adminId,
            detail: `Rejected ${admin.name}'s ${owed.toFixed(2)} ${fiatCurrency} commission for ${day} via Payouts tab${reason ? ` — ${reason}` : ""}`,
          },
        });
      });
      return ok({ ok: true, action, day, adminId, owed, paid, status: "rejected" });
    }

    // unpaid: reverse only the rows this tab created for that day.
    const tabRows = typed.filter((r) => r.reference === TAB_REF && r.periodFrom === day && r.periodTo === day);
    if (tabRows.length === 0) {
      if (paid > 0) return fail("Paid via Settlement — reverse it there");
      return fail("Nothing to reverse");
    }
    const removedPaid = round2(tabRows.filter((r) => dec(r.amount) > 0).reduce((s, r) => s + dec(r.amount), 0));
    await prisma.$transaction(async (tx) => {
      await tx.commissionPayout.deleteMany({ where: { id: { in: tabRows.map((r) => r.id) } } });
      await tx.auditLog.create({
        data: {
          actorId: owner.id,
          action: "commission.payout-reversed",
          targetId: adminId,
          detail: `Reversed ${admin.name}'s Payouts-tab ${removedPaid > 0 ? `${removedPaid.toFixed(2)} ${fiatCurrency} payout` : "rejection"} for ${day}`,
        },
      });
    });
    return ok({ ok: true, action, day, adminId, owed, paid: round2(paid - removedPaid), status: "unpaid" });
  } catch (err) {
    return toErrorResponse(err);
  }
}
