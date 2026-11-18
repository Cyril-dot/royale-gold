// GET /api/admin/attention (Phase 5, staff redesign — brief §7.2 item 2)
// — one call for the admin Overview's "needs attention" tiles: pending
// counts for the admin's PERMITTED sections only. An admin who cannot
// see Money gets no withdrawals count at all (the tile never renders).
//   withdrawals: pending / held / awaiting-owner counts in ONE fiat
//     (?currency=, default the admin's own currency) — the same
//     actionable statuses as the Money queue.
//   kycPending: pending KYC submissions in the admin's downline.
//   tickets: open + answered tickets assigned to the admin.
//   fraud: high / medium counts — computed by computeFraudAlerts, the
//     same live computation as the Fraud page, so the two can never
//     disagree (fraud alerts are computed live, never stored).
// In owner preview (?adminId=, owner role only) the counts are the
// previewed admin's, filtered by THAT admin's permissions — the owner
// sees exactly what the admin sees. No new tables, no stored state.
import { requireRole } from "@/lib/auth";
import { parsePermissions, type AdminSection } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { computeFraudAlerts } from "@/lib/fraud";
import { adminScopeAdminIds } from "@/lib/hierarchy";

export async function GET(req: Request) {
  try {
    const me = await requireRole("admin", "owner");
    const sp = new URL(req.url).searchParams;
    let targetId: string;
    let targetPermissions: string[] | null;
    let targetCurrency: string;
    if (me.role === "owner") {
      // Preview: the owner asks for one admin's attention counts.
      targetId = (sp.get("adminId") || "").trim();
      if (!targetId) return fail("adminId is required");
      const target = await prisma.user.findUnique({
        where: { id: targetId },
        select: { id: true, role: true, permissions: true, currency: true },
      });
      if (!target || target.role !== "admin") return fail("Admin not found", 404);
      targetPermissions = parsePermissions(target.permissions);
      targetCurrency = target.currency ?? "GHS";
    } else {
      targetId = me.id;
      targetPermissions = parsePermissions(me.permissions);
      targetCurrency = me.currency ?? "GHS";
    }
    const fiatCurrency = (sp.get("currency") || targetCurrency).toUpperCase();
    const can = (section: AdminSection): boolean => {
      if (targetPermissions === null) return true;
      return targetPermissions.includes(section);
    };

    const out: Record<string, unknown> = { currency: fiatCurrency, adminId: targetId };

    if (can("money")) {
      const [pending, held, awaitingOwner] = await Promise.all([
        prisma.withdrawal.count({ where: { adminId: targetId, fiatCurrency, status: "pending" } }),
        prisma.withdrawal.count({ where: { adminId: targetId, fiatCurrency, status: "held" } }),
        prisma.withdrawal.count({ where: { adminId: targetId, fiatCurrency, status: "admin_approved" } }),
      ]);
      out.withdrawals = { pending, held, awaitingOwner, actionable: pending + held + awaitingOwner };
    }

    if (can("kyc")) {
      out.kycPending = await prisma.kycSubmission.count({
        where: { status: "pending", user: { referredByAdminId: targetId } },
      });
    }

    if (can("tickets")) {
      const [open, answered] = await Promise.all([
        prisma.ticket.count({ where: { adminId: targetId, status: "open" } }),
        prisma.ticket.count({ where: { adminId: targetId, status: "answered" } }),
      ]);
      out.tickets = { open, answered, needingAttention: open + answered };
    }

    if (can("fraud")) {
      // Same live computation as GET /api/admin/fraud — the downline
      // ids come from the hierarchy scope (child admins roll in).
      const scopeIds = await adminScopeAdminIds(targetId);
      const downline = await prisma.user.findMany({
        where: { referredByAdminId: { in: scopeIds } },
        select: { id: true },
      });
      const alerts = await computeFraudAlerts(downline.map((u) => u.id));
      out.fraud = {
        high: alerts.filter((a) => a.severity === "high").length,
        medium: alerts.filter((a) => a.severity === "medium").length,
      };
    }

    return ok(out);
  } catch (err) {
    return toErrorResponse(err);
  }
}
