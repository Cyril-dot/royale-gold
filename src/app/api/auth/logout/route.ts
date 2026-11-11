import { clearSessionCookie } from "@/lib/auth";
import { ok, toErrorResponse } from "@/lib/http";

export async function POST() {
  try {
    await clearSessionCookie();
    return ok({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
