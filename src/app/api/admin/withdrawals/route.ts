// P0 Batch 1 (A5): the admin's withdrawal queue — pending requests from
// the admin's own players only (adminId stamped at request time).
// Nothing pays out without an admin action.
// P1 Batch 1 (A15): every row carries risk flags computed from real
// data (see src/lib/withdrawals.ts); ?flagged=1 shows flagged only.
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { dec } from "@/lib/money";
import { annotateWithdrawalFlags } from "@/lib/withdrawals";
import { getKycSettings } from "@/lib/kyc-settings";
import { kycRequiredFor, latestKycStatuses } from "@/lib/kyc";

export async function GET(req: Request) {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "money");
    const sp = new URL(req.url).searchParams;
    const status = sp.get("status") || undefined;
    const flaggedOnly = sp.get("flagged") === "1";
    const limit = Math.min(Math.max(Number(sp.get("limit") ?? 50) || 50, 1), 100);
    const rows = await prisma.withdrawal.findMany({
      where: { adminId: admin.id, ...(status ? { status } : {}) },
      include: { user: { select: { id: true, name: true, email: true, phone: true, createdAt: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    const pending = await prisma.withdrawal.count({ where: { adminId: admin.id, status: { in: ["pending", "admin_approved"] } } });
    const flags = await annotateWithdrawalFlags(rows.map((w) => ({ id: w.id, userId: w.userId, amount: dec(w.amount), user: w.user })));
    // P1 Batch 4 (O22): the KYC-required warning — a request above the
    // owner's threshold from a player whose KYC is not Approved gets a
    // flag. A WARNING only: the request can still be approved.
    const kycSettings = await getKycSettings();
    const kycStatuses = await latestKycStatuses(rows.map((w) => w.userId));
    const withdrawals = rows
      .map((w) => ({
        id: w.id,
        userId: w.userId,
        userName: w.user.name,
        userContact: w.user.email ?? w.user.phone ?? null,
        amount: dec(w.amount),
        method: w.method,
        status: w.status,
        reason: w.reason,
        decidedBy: w.decidedBy,
        createdAt: w.createdAt.toISOString(),
        decidedAt: w.decidedAt?.toISOString() ?? null,
        flags: flags.get(w.id) ?? [],
        kycStatus: kycStatuses.get(w.userId) ?? "not_submitted",
        kycRequired: kycRequiredFor(dec(w.amount), kycStatuses.get(w.userId) ?? "not_submitted", kycSettings.withdrawalKycThreshold),
      }))
      .filter((w) => !flaggedOnly || w.flags.length > 0);
    return ok({ withdrawals, pending });
  } catch (err) {
    return toErrorResponse(err);
  }
}
