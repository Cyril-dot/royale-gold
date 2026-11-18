// POST /api/owner/reveal (Phase 3, brief §7.2 item 3 / §4.7) — returns
// ONE unmasked value and writes an audit entry. Owner-only. The audit
// entry records WHO revealed WHAT (kind + target id) — never the value
// itself. Kinds are whitelisted; gateway secrets are never revealable
// (the gateway API only ever returns last-4). Phase 5 reuses this route
// for the admin side by adding an admin-guarded kind.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";

const KINDS = ["withdrawal-account", "user-contact", "payout-account"] as const;
type RevealKind = (typeof KINDS)[number];

export async function POST(req: Request) {
  try {
    const owner = await requireRole("owner");
    const body = await readJson<{ kind?: string; id?: string }>(req);
    if (!body) return fail("Invalid JSON body");
    const kind = body.kind as RevealKind | undefined;
    if (!kind || !(KINDS as readonly string[]).includes(kind)) {
      return fail("kind must be withdrawal-account, user-contact or payout-account");
    }
    const id = (body.id ?? "").trim();
    if (!id) return fail("id is required");

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
