// Nov 2026: the player's ONE saved withdrawal account — bank or MoMo.
// Set on the convert page; each withdrawal request snapshots it. The
// save is audit-logged by TYPE only — account numbers, names and phone
// numbers are never written to the audit log.
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";

const MOMO_NETWORKS = ["MTN", "Telecel", "AirtelTigo"] as const;

function cleanDigits(v: unknown): string {
  return String(v ?? "").replace(/[^0-9]/g, "");
}

export async function GET() {
  try {
    const user = await requireAuth();
    const account = await prisma.withdrawalAccount.findUnique({ where: { userId: user.id } });
    return ok({ account });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await readJson<{
      type?: string;
      bankName?: string;
      accountNumber?: string;
      accountName?: string;
      network?: string;
      phoneNumber?: string;
    }>(req);
    if (!body) return fail("Invalid JSON body");
    const type = (body.type ?? "").trim().toLowerCase();
    if (type !== "bank" && type !== "momo") return fail("Type must be bank or momo");
    const accountName = (body.accountName ?? "").trim();
    if (!accountName) return fail("Account name is required");
    if (accountName.length > 80) return fail("Account name is too long");

    let data: {
      type: string;
      bankName: string | null;
      accountNumber: string | null;
      accountName: string;
      network: string | null;
      phoneNumber: string | null;
    };
    if (type === "bank") {
      const bankName = (body.bankName ?? "").trim();
      const accountNumber = cleanDigits(body.accountNumber);
      if (!bankName) return fail("Bank name is required");
      if (bankName.length > 80) return fail("Bank name is too long");
      if (accountNumber.length < 6 || accountNumber.length > 20) {
        return fail("Account number must be 6–20 digits");
      }
      data = { type, bankName, accountNumber, accountName, network: null, phoneNumber: null };
    } else {
      const network = (body.network ?? "").trim();
      const phoneNumber = cleanDigits(body.phoneNumber);
      if (!MOMO_NETWORKS.includes(network as (typeof MOMO_NETWORKS)[number])) {
        return fail("Network must be MTN, Telecel or AirtelTigo");
      }
      if (!/^0\d{9}$/.test(phoneNumber)) {
        return fail("Phone number must be 10 digits starting with 0");
      }
      data = { type, bankName: null, accountNumber: null, accountName, network, phoneNumber };
    }

    const saved = await prisma.$transaction(async (tx) => {
      const account = await tx.withdrawalAccount.upsert({
        where: { userId: user.id },
        update: { ...data },
        create: { userId: user.id, ...data },
      });
      // Audit the save by type only — never the account values.
      await tx.auditLog.create({
        data: { actorId: user.id, action: "withdrawal.account.set", targetId: account.id, detail: `Saved withdrawal account (${type})` },
      });
      return account;
    });
    return ok({ account: saved });
  } catch (err) {
    return toErrorResponse(err);
  }
}
