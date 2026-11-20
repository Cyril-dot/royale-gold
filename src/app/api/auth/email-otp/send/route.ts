// Email OTP — send (Nov 2026): POST { email } → a 6-digit code
// goes to the inbox. 400 on a bad email or an email that already
// has an account; 429 inside the 60 s resend cooldown or past 3
// codes/hour; 503 when the mailer is not configured or the table
// is missing (names rg-email-otp.sql). The plain code is never
// returned and never stored — SHA-256 hash only.
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import {
  EMAIL_OTP_SQL,
  normalizeEmail,
  OtpError,
  requestEmailCode,
} from "@/lib/email-otp";

export async function POST(req: Request) {
  try {
    const body = await readJson<{ email?: string }>(req);
    if (!body) return fail("Invalid JSON body");
    const email = normalizeEmail(body.email);
    if (!email) return fail("Enter a valid email address");
    try {
      const r = await requestEmailCode(email);
      return ok({ sent: true, expiresInSeconds: r.expiresInSeconds });
    } catch (err) {
      if (err instanceof OtpError) {
        return fail(
          err.message,
          err.status,
          err.retryAfterSeconds !== undefined
            ? { retryAfterSeconds: err.retryAfterSeconds }
            : undefined,
        );
      }
      if (err instanceof Error && err.message.includes(EMAIL_OTP_SQL)) {
        return fail(err.message, 503);
      }
      throw err;
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
