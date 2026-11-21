// Email OTP removed (Nov 2026) — this endpoint is gone (410). Stub
// kept only because the push tool cannot delete files from GitHub.
import { fail } from "@/lib/http";

export async function POST() {
  return fail("Email verification has been removed", 410);
}
