// Email OTP — verify (Nov 2026): POST { email, code } → on a
// correct code, { verifyToken } — a one-time token the register
// call consumes (single-use, 15 min). Wrong code: attempts + 1;
// the 5th wrong guess kills the code. Expired or already-used
// code: 400, request a new one. The code itself is never echoed
// back; the token is returned once, here.
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import {
  EMAIL_OTP_SQL,
  normalizeEmail,
  OtpError,
  verifyEmailCode,
} from "@/lib/email-otp";

export async function POST(req: Request) {
  try {
    const body = await readJson<{ email?: string; code?: string }>(req);
    if (!body) return fail("Invalid JSON body");
    const email = normalizeEmail(body.email);
    if (!email) return fail("Enter a valid email address");
    const code = (body.code ?? "").trim();
    if (!/^\d{6}$/.test(code)) return fail("Enter the 6-digit code");
    try {
      const r = await verifyEmailCode(email, code);
      return ok({ verifyToken: r.verifyToken, expiresInSeconds: r.expiresInSeconds });
    } catch (err) {
      if (err instanceof OtpError) return fail(err.message, err.status);
      if (err instanceof Error && err.message.includes(EMAIL_OTP_SQL)) {
        return fail(err.message, 503);
      }
      throw err;
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
