// POST /api/owner/reveal (Phase 3, brief §7.2 item 3 / §4.7) — returns
// ONE unmasked value and writes an audit entry. The audit entry records
// WHO revealed WHAT (kind + target id) — never the value itself. Kinds
// are whitelisted; gateway secrets are never revealable (the gateway API
// only ever returns last-4). Phase 5 adds the admin side on this same
// route (no second endpoint): `admin-*` kinds are guarded by
// requireRole("admin") + the relevant permission + downline scope — an
// admin can only reveal players in their own downline (child admins
// roll in, same scope as the player detail page) and only withdrawals
// in their own queue. The owner previewing an admin never reveals:
// preview is read-only, and the owner uses the owner kinds instead.
import { requireRole } from "@/lib/auth";
import { canAccessSection, requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { adminScopeAdminIds } from "@/lib/hierarchy";

const OWNER_KINDS = ["withdrawal-account", "user-contact", "payout-account"] as const;
const ADMIN_KINDS = ["admin-withdrawal-account", "admin-user-contact"] as const;
const KINDS = [...OWNER_KINDS, ...ADMIN_KINDS] as const;
type RevealKind = (typeof KINDS)[number];

export async function POST(req: Request) {
  try {
    const body = await readJson<{ kind?: string; id?: string }>(req);
    if (!body) return fail("Invalid JSON body");
    const kind = body.kind as RevealKind | undefined;
    if (!kind || !(KINDS as readonly string[]).includes(kind)) {
      return fail("kind must be withdrawal-account, user-contact, payout-account, admin-withdrawal-account or admin-user-contact");
    }
    const id = (body.id ?? "").trim();
    if (!id) return fail("id is required");

    // --- Admin kinds (Phase 5) -------------------------------------------
    if (kind === "admin-withdrawal-account" || kind === "admin-user-contact") {
      const admin = await requireRole("admin");
      if (kind === "admin-withdrawal-account") {
        requirePermission(admin, "money");
        let w;
        try {
          w = await prisma.withdrawal.findUnique({
            where: { id },
            select: {
              id: true,
              userId: true,
              adminId: true,
              accountType: true,
              accountName: true,
              accountDetail: true,
              user: { select: { name: true } },
            },
          });
        } catch (err) {
          // Prod may not have the rg-withdrawal-account.sql columns yet
          // (P2022 = column does not exist): honest 503, not a 500.
          if ((err as { code?: string }).code === "P2022") {
            return fail(
              "Account details are not available yet — the withdrawal-account columns have not been added in production.",
              503,
            );
          }
          throw err;
        }
        if (!w || w.adminId !== admin.id) return fail("Withdrawal not found", 404);
        // Audit first: a failed audit write 500s without leaking the value.
        await prisma.auditLog.create({
          data: {
            actorId: admin.id,
            action: "data.reveal",
            targetId: w.id,
            detail: `Admin ${admin.name} revealed the payout account on withdrawal ${w.id} (user ${w.userId})`,
          },
        });
        return ok({
          ok: true,
          kind,
          id: w.id,
          value: { accountType: w.accountType, accountName: w.accountName, accountDetail: w.accountDetail },
        });
      }

      // admin-user-contact: a player's email / phone, for any masked
      // contact in the admin panels (Money queue, Players list, Fraud,
      // Tickets). The admin needs at least one player-facing section
      // and the player must be in their downline (child admins roll in).
      const sections = ["players", "money", "fraud", "tickets", "kyc"] as const;
      if (!sections.some((s) => canAccessSection(admin, s))) {
        return fail("You do not have access to player contacts", 403);
      }
      const u = await prisma.user.findUnique({
        where: { id },
        select: { id: true, name: true, email: true, phone: true, referredByAdminId: true },
      });
      if (!u) return fail("User not found", 404);
      const scopeIds = await adminScopeAdminIds(admin.id);
      if (!u.referredByAdminId || !scopeIds.includes(u.referredByAdminId)) {
        return fail("User not found", 404);
      }
      await prisma.auditLog.create({
        data: {
          actorId: admin.id,
          action: "data.reveal",
          targetId: u.id,
          detail: `Admin ${admin.name} revealed the contact for user ${u.name}`,
        },
      });
      return ok({
        ok: true,
        kind,
        id: u.id,
        value: { name: u.name, email: u.email, phone: u.phone },
      });
    }

    // --- Owner kinds (Phase 3, unchanged) --------------------------------
    const owner = await requireRole("owner");

    // withdrawal-account: the payout account snapshot saved ON the
    // withdrawal (accountType/accountName/accountDetail). The owner
    // withdrawals list deliberately does NOT select these columns, so
    // this is the only path that reads them — one row, on demand.
    if (kind === "withdrawal-account") {
      let w;
      try {
        w = await prisma.withdrawal.findUnique({
          where: { id },
          select: {
            id: true,
            userId: true,
            accountType: true,
            accountName: true,
            accountDetail: true,
            user: { select: { name: true } },
          },
        });
      } catch (err) {
        // Prod may not have the rg-withdrawal-account.sql columns yet
        // (P2022 = column does not exist): honest 503, not a 500.
        if ((err as { code?: string }).code === "P2022") {
          return fail(
            "Account details are not available yet — the withdrawal-account columns have not been added in production.",
            503,
          );
        }
        throw err;
      }
      if (!w) return fail("Withdrawal not found", 404);
      // Audit first: a failed audit write 500s without leaking the value.
      await prisma.auditLog.create({
        data: {
          actorId: owner.id,
          action: "data.reveal",
          targetId: w.id,
          detail: `Owner revealed the payout account on withdrawal ${w.id} (user ${w.userId})`,
        },
      });
      return ok({
        ok: true,
        kind,
        id: w.id,
        value: { accountType: w.accountType, accountName: w.accountName, accountDetail: w.accountDetail },
      });
    }

    // user-contact: a player's email / phone, for any masked contact in
    // the owner panels (withdrawals queue, commission deposits, ledger).
    // Keyed by user id so every surface uses the same kind.
    if (kind === "user-contact") {
      const u = await prisma.user.findUnique({
        where: { id },
        select: { id: true, name: true, email: true, phone: true },
      });
      if (!u) return fail("User not found", 404);
      await prisma.auditLog.create({
        data: {
          actorId: owner.id,
          action: "data.reveal",
          targetId: u.id,
          detail: `Owner revealed the contact for user ${u.name}`,
        },
      });
      return ok({
        ok: true,
        kind,
        id: u.id,
        value: { name: u.name, email: u.email, phone: u.phone },
      });
    }

    // payout-account: the admin's saved payout account + contact, for
    // the Payouts Details view. One call unmasks email + phone +
    // account together (one audit entry, not three).
    const admin = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, phone: true, role: true },
    });
    if (!admin || admin.role !== "admin") return fail("Admin not found", 404);
    const account = await prisma.withdrawalAccount.findUnique({
      where: { userId: id },
      select: { type: true, bankName: true, accountNumber: true, network: true, phoneNumber: true, accountName: true },
    });
    await prisma.auditLog.create({
      data: {
        actorId: owner.id,
        action: "data.reveal",
        targetId: admin.id,
        detail: `Owner revealed payout details for admin ${admin.name}`,
      },
    });
    return ok({
      ok: true,
      kind,
      id: admin.id,
      value: { adminName: admin.name, email: admin.email, phone: admin.phone, account },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
