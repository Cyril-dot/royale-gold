import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession, setSessionCookie } from "@/lib/auth";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { normalizeCode, publicUser } from "@/lib/serialize";

export async function POST(req: Request) {
  try {
    const body = await readJson<{
      name?: string;
      emailOrPhone?: string;
      password?: string;
      refCode?: string;
    }>(req);
    if (!body) return fail("Invalid JSON body");
    const name = (body.name ?? "").trim();
    const emailOrPhone = (body.emailOrPhone ?? "").trim();
    const password = body.password ?? "";
    const refCode = body.refCode ? normalizeCode(body.refCode) : null;

    if (!name) return fail("Name is required");
    if (!emailOrPhone) return fail("Email or phone is required");
    if (password.length < 6) return fail("Password must be at least 6 characters");

    const isEmail = emailOrPhone.includes("@");
    const email = isEmail ? emailOrPhone.toLowerCase() : null;
    const phone = isEmail ? null : emailOrPhone;

    if (email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) return fail("An account with this email already exists", 409);
    }

    // Referral codes are validated server-side BEFORE the account is created.
    let codeRow: { id: string; adminId: string; active: boolean } | null = null;
    if (refCode) {
      codeRow = await prisma.referralCode.findUnique({
        where: { code: refCode },
        select: { id: true, adminId: true, active: true },
      });
      if (!codeRow || !codeRow.active) return fail("Invalid referral code", 400);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name,
          email,
          phone,
          passwordHash,
          role: "user",
          cashBalance: 250,
          simBalance: 1000,
          // New accounts start with 10 coins; a valid referral code adds exactly 5.
          coins: codeRow ? 15 : 10,
          referredByAdminId: codeRow?.adminId ?? null,
          referralCodeUsed: refCode,
        },
      });
      if (codeRow) {
        await tx.redemption.create({
          data: { userId: created.id, codeId: codeRow.id, coins: 5 },
        });
      }
      return created;
    });

    await setSessionCookie(await createSession(user.id, "user"));
    return ok({ user: publicUser(user), referredBonusCoins: codeRow ? 5 : 0 }, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
