// Nov 2026 Flutterwave v3 (Nigeria only): the owner "Test connection"
// probe for the Nigeria gateway. Hits GET /v3/banks/NG with the saved
// secret key (no payment is created). A 200 means the key is valid; a
// 401/403 means Flutterwave rejected it. Mirrors the PayTeller test
// route (GET /api/v1/auth there).
import { requireRole } from "@/lib/auth";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { FlutterwaveError, testFlutterwaveAuth } from "@/lib/flutterwave";

export async function POST() {
  try {
    await requireRole("owner");
    const result = await testFlutterwaveAuth();
    return ok(result);
  } catch (err) {
    if (err instanceof FlutterwaveError) return fail(err.message, err.statusCode);
    return toErrorResponse(err);
  }
}
