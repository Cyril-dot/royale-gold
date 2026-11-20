// Nov 2026 Theteller (PaySwitch): test the saved credentials
// against Theteller without creating a payment. There is no /auth
// endpoint on the v1.1 API, so the test is a status check on a dummy
// transaction id: any Theteller-shaped answer proves the request was
// authenticated (an unknown transaction still answers), while codes
// 979 / 600 / 999 mean the credentials were rejected. Best-effort —
// the exact unknown-transaction body is unverified until sandbox
// tests record it. A 503 means the credentials are not configured;
// a 502 means Theteller could not be reached.
import { requireRole } from "@/lib/auth";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { getStatus, ThetellerError } from "@/lib/theteller";

export async function POST() {
  try {
    await requireRole("owner");
    try {
      const r = await getStatus("000000000000");
      const code = r.code != null ? String(r.code) : "";
      if (code === "979" || code === "600" || code === "999") {
        return fail(`Theteller rejected these credentials (${code}: ${r.reason ?? "access denied"})`, 401);
      }
      return ok({ authenticated: true, code: code || null, reason: r.reason ?? null });
    } catch (err) {
      if (err instanceof ThetellerError) {
        if (err.providerCode === "979" || err.providerCode === "600" || err.providerCode === "999") {
          return fail(`Theteller rejected these credentials (${err.providerCode})`, 401);
        }
        return fail(err.message, err.statusCode);
      }
      throw err;
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
