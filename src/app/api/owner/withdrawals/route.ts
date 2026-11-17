// P0 Batch 1 (O8): the owner's withdrawal oversight — every pending
// withdrawal platform-wide, with the player and the referring admin.
// This is the second half of maker-checker: large withdrawals an admin
// approved sit here as "admin_approved" until the owner approves them.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { dec } from "@/lib/money";
import { annotateWithdrawalFlags } from "@/lib/withdrawals";
import { getKycSettings } from "@/lib/kyc-settings";
import { kycRequiredFor, latestKycStatuses } from "@/lib/kyc";

export async function GET(req: Request) {
  try {
    await requireRole("owner");
    const sp = new URL(req.url).searchParams;
    const status = sp.get("status") || undefined;
    // Owner preview of one admin's panel (?preview=<adminId>): narrow to
    // that admin's queue.
    const adminId = sp.get("adminId") || undefined;
    const flaggedOnly = sp.get("flagged") === "1";
    const limit = Math.min(Math.max(Number(sp.get("limit") ?? 50) || 50, 1), 100);
    // Phase 1 country-based (Nov 2026): ?currency= (default GHS) — the
    // queue is in one fiat only.
    const fiatCurrency = (sp.get("currency") || "GHS").toUpperCase();
    const rows = await prisma.withdrawal.findMany({
      where: { fiatCurrency, ...(status ? { status } : {}), ...(adminId ? { adminId } : {}) },
      // Select only the columns this route maps: an unfiltered select
      // also pulls newer columns (accountType/accountName/accountDetail)
      // that prod may not have yet, and the whole query throws.
      // (Prisma takes either select or include — the relations live
      // inside select here.)
      select: {
        id: true, userId: true, adminId: true, amount: true, method: true,
        fiatCurrency: true, status: true, reason: true, decidedBy: true,
        createdAt: true, decidedAt: true,
        user: { select: { id: true, name: true, email: true, phone: true, createdAt: true } },
        admin: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    const pending = await prisma.withdrawal.count({ where: { fiatCurrency, status: { in: ["pending", "admin_approved", "held"] } } });
    // P1 Batch 1 (A15): risk flags on every row (same computation as the admin queue).
    const flags = await annotateWithdrawalFlags(rows.map((w) => ({ id: w.id, userId: w.userId, amount: dec(w.amount), user: w.user })));
    // P1 Batch 4 (O22): the KYC-required warning (same rule as the admin queue).
    const kycSettings = await getKycSettings();
    const kycStatuses = await latestKycStatuses(rows.map((w) => w.userId));
    return ok({
      withdrawals: rows
        .map((w) => ({
          id: w.id,
          userId: w.userId,
          userName: w.user.name,
          userContact: w.user.email ?? w.user.phone ?? null,
          adminId: w.adminId,
          adminName: w.admin?.name ?? null,
          amount: dec(w.amount),
          method: w.method,
          fiatCurrency: w.fiatCurrency ?? "GHS",
          status: w.status,
          reason: w.reason,
          decidedBy: w.decidedBy,
          createdAt: w.createdAt.toISOString(),
          decidedAt: w.decidedAt?.toISOString() ?? null,
          flags: flags.get(w.id) ?? [],
          kycStatus: kycStatuses.get(w.userId) ?? "not_submitted",
          kycRequired: kycRequiredFor(dec(w.amount), kycStatuses.get(w.userId) ?? "not_submitted", kycSettings.withdrawalKycThreshold),
        }))
        .filter((w) => !flaggedOnly || w.flags.length > 0),
      pending,
      currency: fiatCurrency,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
