// P0 Batch 1 (A4, owner preview): one admin's deposits, for the owner's
// preview of that admin's panel (?preview=<adminId> on /admin/money).
// Same shape as GET /api/admin/deposits; the owner may only preview an
// existing admin.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { dec } from "@/lib/money";

export async function GET(req: Request) {
  try {
    await requireRole("owner");
    const sp = new URL(req.url).searchParams;
    const adminId = sp.get("adminId");
    if (!adminId) return fail("adminId is required");
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== "admin") return fail("Admin not found", 404);
    const method = sp.get("method") || undefined;
    const q = (sp.get("q") || "").trim().toLowerCase();
    const from = sp.get("from");
    const to = sp.get("to");
    const limit = Math.min(Math.max(Number(sp.get("limit") ?? 50) || 50, 1), 100);
    // Phase 1 country-based (Nov 2026): ?currency= (default GHS) — rows
    // AND totals are in one fiat only.
    const fiatCurrency = (sp.get("currency") || "GHS").toUpperCase();
    const fromD = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? new Date(`${from}T00:00:00.000Z`) : undefined;
    const toD = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? new Date(`${to}T23:59:59.999Z`) : undefined;

    const rows = await prisma.depositEvent.findMany({
      where: {
        adminId,
        fiatCurrency,
        ...(method ? { method } : {}),
        createdAt: { gte: fromD, lte: toD },
      },
      include: { user: { select: { id: true, name: true, email: true, phone: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const filtered = rows.filter((d) => {
      if (!q) return true;
      return `${d.user.name} ${d.user.email ?? ""} ${d.user.phone ?? ""} ${d.id}`.toLowerCase().includes(q);
    });
    const page = filtered.slice(0, limit);
    const totalAmount = filtered.reduce((s, d) => s + dec(d.amount), 0);
    const totalCommission = filtered.reduce((s, d) => s + dec(d.commission), 0);
    return ok({
      deposits: page.map((d) => ({
        id: d.id,
        userId: d.userId,
        userName: d.user.name,
        userContact: d.user.email ?? d.user.phone ?? null,
        amount: dec(d.amount),
        method: d.method,
        fiatCurrency: d.fiatCurrency ?? "GHS",
        pctInForce: dec(d.pctInForce),
        commission: dec(d.commission),
        createdAt: d.createdAt.toISOString(),
      })),
      totals: { deposits: filtered.length, totalAmount: Math.round(totalAmount * 100) / 100, totalCommission: Math.round(totalCommission * 100) / 100 },
      currency: fiatCurrency,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
