// P0 Batch 3 (O2/O15): edit an admin — commissionPct, active,
// per-section permissions, and 2FA reset. The owner (root) account
// cannot be edited or deactivated from the panel (403, plain message).
// Deactivating an admin kills ALL of their sessions immediately (their
// JWTs stop working at once) and writes an AuditLog row.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { publicUser } from "@/lib/serialize";
import { isAdminSection, serializePermissions, type AdminSection } from "@/lib/rbac";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const owner = await requireRole("owner");
    const { id } = await params;
    const body = await readJson<{
      commissionPct?: number | null;
      active?: boolean;
      permissions?: string[] | null;
      resetTotp?: boolean;
    }>(req);
    if (!body) return fail("Invalid JSON body");
    const admin = await prisma.user.findUnique({ where: { id } });
    if (!admin) return fail("Admin not found", 404);
    // O15: the root account cannot be edited or deactivated from the panel.
    if (admin.role === "owner") {
      return fail("The owner account cannot be edited or deactivated from the panel", 403);
    }
    if (admin.role !== "admin") return fail("Admin not found", 404);

    const data: {
      commissionPct?: number | null;
      active?: boolean;
      permissions?: string | null;
      totpSecret?: string | null;
      totpEnabled?: boolean;
      sessionVersion?: { increment: number };
    } = {};
    if (body.commissionPct !== undefined) {
      const pct = body.commissionPct === null ? null : Number(body.commissionPct);
      if (pct !== null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) {
        return fail("commissionPct must be between 0 and 100");
      }
      data.commissionPct = pct;
    }
    let deactivating = false;
    if (body.active !== undefined) {
      data.active = Boolean(body.active);
      deactivating = admin.active && body.active === false;
      // O15: deactivating kills every session the admin holds.
      if (deactivating) data.sessionVersion = { increment: 1 };
    }
    if (body.permissions !== undefined) {
      const list = body.permissions;
      if (list !== null && (!Array.isArray(list) || !list.every((x) => typeof x === "string" && isAdminSection(x)))) {
        return fail("permissions must be a list of section names");
      }
      data.permissions = serializePermissions(list as AdminSection[] | null);
    }
    if (body.resetTotp === true) {
      data.totpSecret = null;
      data.totpEnabled = false;
    }
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id }, data });
      if (body.permissions !== undefined) {
        await tx.auditLog.create({
          data: {
            actorId: owner.id,
            action: "admin.permission",
            targetId: id,
            detail: `Set permissions for ${admin.name} to ${data.permissions ?? "all sections"}`,
          },
        });
      }
      if (deactivating) {
        await tx.auditLog.create({
          data: {
            actorId: owner.id,
            action: "admin.deactivate",
            targetId: id,
            detail: `Deactivated ${admin.name} — all sessions killed`,
          },
        });
      }
      if (body.resetTotp === true) {
        await tx.auditLog.create({
          data: {
            actorId: owner.id,
            action: "auth.2fa.disable",
            targetId: id,
            detail: `Reset two-factor auth for ${admin.name}`,
          },
        });
      }
      return u;
    });
    return ok({ admin: publicUser(updated) });
  } catch (err) {
    return toErrorResponse(err);
  }
}
