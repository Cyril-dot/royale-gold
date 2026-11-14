// P0 Batch 3 (O5): commission settlement & payouts — owner only.
// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD (default: this month) lists, per
// admin, the commission OWED (recomputed from the ledger by the rules
// engine), the amount already PAID (sum of CommissionPayout rows), and
// the BALANCE. POST records a payout { adminId, amount, method,
// reference?, periodFrom?, periodTo? } — it writes the CommissionPayout
// row, a "payout" row to the ledger (via the ledger builder reading this
// table), and an AuditLog row, so the numbers cannot disagree.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { dec, round2, todayStr } from "@/lib/money";
import { settlementForAdmin } from "@/lib/commission";

const METHODS = ["MTN", "Telecel", "AirtelTigo", "bank", "cash"] as const;

function monthStart(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export async function GET(req: Request) {
  try {
    await requireRole("owner");
    const sp = new URL(req.url).searchParams;
    const from = sp.get("from") ?? monthStart();
    const to = sp.get("to") ?? todayStr();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return fail("from and to must be YYYY-MM-DD");
    }
    const admins = await prisma.user.findMany({
      where: { role: "admin" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, active: true },
    });
    const rows = [];
    for (const a of admins) {
      const s = await settlementForAdmin(a.id, from, to);
      rows.push({ adminId: a.id, adminName: a.name, adminEmail: a.email, active: a.active, ...s });
    }
    const totals = {
      owed: round2(rows.reduce((s, r) => s + r.owed, 0)),
      paid: round2(rows.reduce((s, r) => s + r.paid, 0)),
      balance: round2(rows.reduce((s, r) => s + r.balance, 0)),
    };
    return ok({ from, to, rows, totals });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const owner = await requireRole("owner");
    const body = await readJson<{
      adminId?: string;
      amount?: number;
      method?: string;
      reference?: string;
      periodFrom?: string;
      periodTo?: string;
    }>(req);
    if (!body) return fail("Invalid JSON body");
    const adminId = (body.adminId ?? "").trim();
    if (!adminId) return fail("adminId is required");
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return fail("Amount must be > 0");
    const method = body.method ?? "";
    if (!METHODS.includes(method as (typeof METHODS)[number])) {
      return fail(`Method must be one of: ${METHODS.join(", ")}`);
    }
    const reference = (body.reference ?? "").trim() || null;
    const periodFrom = body.periodFrom ?? null;
    const periodTo = body.periodTo ?? null;
    if (periodFrom && !/^\d{4}-\d{2}-\d{2}$/.test(periodFrom)) return fail("periodFrom must be YYYY-MM-DD");
    if (periodTo && !/^\d{4}-\d{2}-\d{2}$/.test(periodTo)) return fail("periodTo must be YYYY-MM-DD");
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== "admin") return fail("Admin not found", 404);

    const created = await prisma.$transaction(async (tx) => {
      const payout = await tx.commissionPayout.create({
        data: {
          adminId,
          amount: round2(amount),
          method,
          reference,
          periodFrom,
          periodTo,
          createdBy: owner.id,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: owner.id,
          action: "commission.payout",
          targetId: adminId,
          detail: `Paid ${admin.name} GH₵ ${round2(amount).toFixed(2)} via ${method}${reference ? ` (${reference})` : ""}`,
        },
      });
      return payout;
    });
    return ok(
      {
        payout: {
          id: created.id,
          adminId: created.adminId,
          adminName: admin.name,
          amount: dec(created.amount),
          method: created.method,
          reference: created.reference,
          periodFrom: created.periodFrom,
          periodTo: created.periodTo,
          createdAt: created.createdAt.toISOString(),
        },
      },
      201,
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
