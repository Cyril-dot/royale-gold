// Phase 2 PayTeller (Nov 2026): test the saved credentials against
// PayTeller without creating a payment — GET /api/v1/auth. Returns
// {authenticated, merchant_id, environment}. A 503 means the credentials
// are not configured; a 401/403 means PayTeller rejected them.
import { requireRole } from "@/lib/auth";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { PaytellerError, testAuth } from "@/lib/payteller";

export async function POST() {
  try {
    await requireRole("owner");
    const result = await testAuth();
    return ok(result);
  } catch (err) {
    if (err instanceof PaytellerError) return fail(err.message, err.statusCode);
    return toErrorResponse(err);
  }
}
