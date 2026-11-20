import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession, setSessionCookie } from "@/lib/auth";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { normalizeCode, publicUser } from "@/lib/serialize";
import { currencyForCountry, isOfferedCountry } from "@/lib/country";
// Email OTP (Nov 2026): the email must be proven real BEFORE the
// account is created — register consumes a one-time verify token
// issued by POST /api/auth/email-otp/verify. No token, no account.
import { consumeVerifyToken, EMAIL_OTP_SQL, OtpError } from "@/lib/email-otp";
// P1 Batch 3 (O19): promotion engine — signup free coins.
import { applyFreeCoinsSignup } from "@/lib/promotions";

export async function POST(req: Request) {
  try {
    const body = await readJson<{
      name?: string;
      emailOrPhone?: string;
      password?: string;
      refCode?: string;
      country?: string;
      verifyToken?: string;
    }>(req);
    if (!body) return fail("Invalid JSON body");
    const name = (body.name ?? "").trim();
    const emailOrPhone = (body.emailOrPhone ?? "").trim();
    const password = body.password ?? "";
    const refCode = body.refCode ? normalizeCode(body.refCode) : null;
    const verifyToken = (body.verifyToken ?? "").trim();
    // Phase 1 country-based (Nov 2026): the register form sends the
    // country the player picked (GH | NG, default GH). The fiat is
    // derived from it and stored — it is IMMUTABLE after register.
    // An unknown or un-offered country is rejected, never silently
    // mapped, so a client bug cannot create a wrong-currency account.
    const country = (body.country ?? "GH").toUpperCase();
    if (!isOfferedCountry(country)) return fail("Country must be Ghana or Nigeria", 400);
    const currency = currencyForCountry(country);

    if (!name) return fail("Name is required");
    if (!emailOrPhone) return fail("Email or phone is required");
    if (password.length < 6) return fail("Password must be at least 6 characters");

    const isEmail = emailOrPhone.includes("@");
    const email = isEmail ? emailOrPhone.toLowerCase() : null;
    // Email OTP (Nov 2026): verify-before-register for everyone. A
    // phone-only signup no longer exists — the verified email IS the
    // account email, and no phone is collected at signup (the login
    // phone branch still works for older phone accounts). The token
    // is checked server-side; a client flag is never trusted.
    if (!email) {
      return fail("Verify an email address before creating your account — a code is sent to your inbox first", 403);
    }
    if (!verifyToken) {
      return fail("Verify your email before creating your account", 403);
    }
    const phone = null;

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
    let txResult: {
      created: Awaited<ReturnType<typeof prisma.user.create>>;
      promoCoins: { promotionId: string; name: string; amount: number }[];
    };
    try {
      txResult = await prisma.$transaction(async (tx) => {
        // Email OTP: consume the verify token FIRST, in the same
        // transaction as the account create — a token can never be
        // spent twice, and a failed create leaves it unspent.
        await consumeVerifyToken(tx, email, verifyToken);
        const created = await tx.user.create({
          data: {
            name,
            email,
            phone,
            passwordHash,
            role: "user",
            country,
            currency,
            // Signup balances (Nov 2026): NO starting cash — a new
            // account starts at 0.00 and deposits to play. SIM stays
            // 1000 for demo play. Coins: 5 base; a valid referral code
            // adds exactly 5 more (10 total) — the bonus is unchanged.
            cashBalance: 0,
            simBalance: 1000,
            coins: codeRow ? 10 : 5,
            referredByAdminId: codeRow?.adminId ?? null,
            referralCodeUsed: refCode,
          },
        });
        if (codeRow) {
          await tx.redemption.create({
            data: { userId: created.id, codeId: codeRow.id, coins: 5 },
          });
        }
        // P1 Batch 3 (O19): a live free_coins promotion with trigger
        // "signup" grants its coins on top of the 10 (or 15) signup
        // coins, in the same transaction as the account creation.
        const promoCoins = await applyFreeCoinsSignup(tx, created.id, created.name, codeRow?.adminId ?? null);
        return { created, promoCoins };
        });
    } catch (err) {
      if (err instanceof OtpError) return fail(err.message, err.status);
      if (err instanceof Error && err.message.includes(EMAIL_OTP_SQL)) return fail(err.message, 503);
      throw err;
    }
    const { created: newUser, promoCoins } = txResult;

    // The signup promotion (if one fired) credited coins after the
    // create above — re-read so the returned user carries the real
    // balance, never a stale one.
    const freshUser = promoCoins.length > 0
      ? await prisma.user.findUnique({ where: { id: newUser.id } })
      : newUser;
    await setSessionCookie(await createSession(newUser.id, "user"));
    return ok({ user: publicUser(freshUser ?? newUser), referredBonusCoins: codeRow ? 5 : 0, promoCoins }, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
