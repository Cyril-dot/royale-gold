// P1 Batch 2 (A21): the owner's KYC oversight — every submission
// platform-wide, or one admin's queue in preview (?adminId=).
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/http";
import { KYC_DOCUMENT_LABELS } from "@/lib/kyc";

export async function GET(req: Request) {
  try {
    await requireRole("owner");
    const sp = new URL(req.url).searchParams;
    const status = sp.get("status") || "pending";
    const statusFilter =
      status === "all" ? undefined : ["pending", "approved", "rejected"].includes(status) ? status : "pending";
    const adminId = sp.get("adminId") || undefined;
    const limit = Math.min(Math.max(Number(sp.get("limit") ?? 100) || 100, 1), 200);
    const rows = await prisma.kycSubmission.findMany({
      where: {
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(adminId ? { user: { referredByAdminId: adminId } } : {}),
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true, referredByAdmin: { select: { id: true, name: true } } },
        },
        reviewer: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    const counts = await prisma.kycSubmission.groupBy({
      by: ["status"],
      where: adminId ? { user: { referredByAdminId: adminId } } : {},
      _count: { _all: true },
    });
    const countByStatus: Record<string, number> = { pending: 0, approved: 0, rejected: 0 };
    for (const c of counts) countByStatus[c.status] = c._count._all;
    return ok({
      submissions: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        userName: r.user.name,
        userContact: r.user.email ?? r.user.phone ?? null,
        referringAdmin: r.user.referredByAdmin?.name ?? null,
        documentType: r.documentType,
        documentTypeLabel: KYC_DOCUMENT_LABELS[r.documentType as keyof typeof KYC_DOCUMENT_LABELS] ?? r.documentType,
        documentUrl: r.documentUrl,
        status: r.status,
        autoApproved: r.autoApproved,
        reviewedBy: r.reviewer?.name ?? null,
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
        rejectionReason: r.rejectionReason,
        submittedAt: r.createdAt.toISOString(),
      })),
      counts: countByStatus,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
