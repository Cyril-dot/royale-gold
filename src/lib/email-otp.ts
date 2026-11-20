// Email OTP verification (Nov 2026): the email must be proven real
// BEFORE the account is created. Flow: send a 6-digit code to the
// inbox → the player enters it → a one-time verify token is issued →
// POST /api/auth/register consumes that token. No token, no account.
//
// The plain code is NEVER stored (SHA-256 hash only); the verify
// token is stored hashed too. Limits: 60 s resend cooldown per
// email, max 3 codes/hour per email, 10-min code expiry, 5 wrong
// guesses kills the code, verify token single-use with 15-min
// expiry.
//
// PROD SAFETY: every read/write catches P2021/P2022 (table missing)
// and throws a plain Error naming rg-email-otp.sql — routes map it
// to 503, same pattern as the deposit-number code.
import { createHash, randomBytes, randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { mailerConfigured, sendVerificationEmail } from "./mailer";

export const EMAIL_OTP_SQL = "rg-email-otp.sql";
export const OTP_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const OTP_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
export const OTP_MAX_SENDS_PER_HOUR = 3;
export const OTP_MAX_ATTEMPTS = 5;

/** An OTP failure the route returns as-is (message + HTTP status). */
export class OtpError extends Error {
  status: number;
  retryAfterSeconds?: number;
  constructor(message: string, status = 400, retryAfterSeconds?: number) {
    super(message);
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function isMissingTable(err: unknown): boolean {
  const code = (err as { code?: string }).code;
  return code === "P2021" || code === "P2022";
}

function missingTableError(): Error {
  return new Error(
    `Email verification is not set up yet — run ${EMAIL_OTP_SQL} in Neon first.`,
  );
}

function isMissingTableError(err: unknown): boolean {
  return err instanceof Error && err.message.includes(EMAIL_OTP_SQL);
}

/** Lowercase + trim, or null when it is not a plausible email. */
export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  if (e.length === 0 || e.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Send a fresh code to `email`. Throws OtpError on every refusal
 * (already an account, cooldown, hourly cap, mailer not set up, mail
 * send failure) and a plain 503 Error naming the SQL file when the
 * table is missing. Returns the code TTL in seconds for the UI.
 */
export async function requestEmailCode(email: string): Promise<{ expiresInSeconds: number }> {
  try {
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      throw new OtpError("This email already has an account — log in instead", 400);
    }

    const now = new Date();
    const latest = await prisma.emailVerification.findFirst({
      where: { email },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (latest) {
      const sinceSendMs = now.getTime() - latest.createdAt.getTime();
      if (sinceSendMs < OTP_RESEND_COOLDOWN_MS) {
        const retryAfterSeconds = Math.ceil((OTP_RESEND_COOLDOWN_MS - sinceSendMs) / 1000);
        throw new OtpError(
          `Wait ${retryAfterSeconds}s before requesting another code`,
          429,
          retryAfterSeconds,
        );
      }
    }
    const sentLastHour = await prisma.emailVerification.count({
      where: { email, createdAt: { gt: new Date(now.getTime() - 60 * 60 * 1000) } },
    });
    if (sentLastHour >= OTP_MAX_SENDS_PER_HOUR) {
      throw new OtpError("Too many codes sent to this email — try again in an hour", 429);
    }
    if (!mailerConfigured()) {
      throw new OtpError(
        "Email sending is not set up yet — set SMTP_USER and SMTP_PASS first",
        503,
      );
    }

    const code = String(randomInt(100000, 1000000));
    const row = await prisma.emailVerification.create({
      data: {
        email,
        codeHash: sha256(code),
        expiresAt: new Date(now.getTime() + OTP_CODE_TTL_MS),
      },
      select: { id: true },
    });
    try {
      await sendVerificationEmail(email, code);
    } catch {
      // The code is useless if the mail never left — drop the row so
      // the cooldown/hourly cap do not punish the player for it.
      await prisma.emailVerification.delete({ where: { id: row.id } }).catch(() => undefined);
      throw new OtpError("Could not send the email — check the address and try again", 503);
    }
    return { expiresInSeconds: OTP_CODE_TTL_MS / 1000 };
  } catch (err) {
    if (err instanceof OtpError) throw err;
    if (isMissingTable(err)) throw missingTableError();
    throw err;
  }
}

/**
 * Check a code. Correct → mark the row verified and return a
 * one-time verify token (plain — the client hands it to register).
 * Wrong → attempts + 1; the 5th wrong guess kills the code.
 */
export async function verifyEmailCode(
  email: string,
  code: string,
): Promise<{ verifyToken: string; expiresInSeconds: number }> {
  try {
    const row = await prisma.emailVerification.findFirst({
      where: { email },
      orderBy: { createdAt: "desc" },
    });
    if (!row) {
      throw new OtpError("No code was sent to this email — request one first", 400);
    }
    if (row.verifiedAt) {
      throw new OtpError("This code was already used — request a new one", 400);
    }
    if (row.expiresAt.getTime() < Date.now()) {
      throw new OtpError("This code expired — request a new one", 400);
    }
    if (sha256(code) !== row.codeHash) {
      const attempts = row.attempts + 1;
      if (attempts >= OTP_MAX_ATTEMPTS) {
        await prisma.emailVerification.delete({ where: { id: row.id } });
        throw new OtpError("Too many wrong codes — request a new one", 400);
      }
      await prisma.emailVerification.update({
        where: { id: row.id },
        data: { attempts },
      });
      throw new OtpError("Wrong code — try again", 400);
    }
    const token = randomBytes(32).toString("hex");
    const now = new Date();
    await prisma.emailVerification.update({
      where: { id: row.id },
      data: {
        verifiedAt: now,
        verifyTokenHash: sha256(token),
        verifyTokenExpiresAt: new Date(now.getTime() + OTP_TOKEN_TTL_MS),
      },
    });
    return { verifyToken: token, expiresInSeconds: OTP_TOKEN_TTL_MS / 1000 };
  } catch (err) {
    if (err instanceof OtpError) throw err;
    if (isMissingTable(err)) throw missingTableError();
    throw err;
  }
}

/**
 * Consume a verify token INSIDE the register transaction (same tx as
 * the user create, so a token can never be spent twice). Throws
 * OtpError 403 when the token is missing, wrong, expired, or already
 * spent. Callers must map OtpError to fail(message, status) and a
 * missing-table Error to 503.
 */
export async function consumeVerifyToken(
  tx: Prisma.TransactionClient,
  email: string,
  token: string,
): Promise<void> {
  try {
    const row = await tx.emailVerification.findFirst({
      where: {
        email,
        verifyTokenHash: sha256(token),
        verifiedAt: { not: null },
        verifyTokenExpiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!row) {
      throw new OtpError(
        "This email is not verified — send a code and verify it first",
        403,
      );
    }
    // Single-use: clear the token so a replayed register call fails.
    await tx.emailVerification.update({
      where: { id: row.id },
      data: { verifyTokenHash: null, verifyTokenExpiresAt: null },
    });
  } catch (err) {
    if (err instanceof OtpError) throw err;
    if (isMissingTable(err)) throw missingTableError();
    throw err;
  }
}

export { isMissingTableError };
