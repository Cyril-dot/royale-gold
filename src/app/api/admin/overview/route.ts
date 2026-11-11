import { requireRole } from "@/lib/auth";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { adminOverview } from "@/lib/admin";

export async function GET() {
  try {
    const admin = await requireRole("admin");
    const payload = await adminOverview(admin.id);
    if (!payload) return fail("Admin not found", 404);
    return ok(payload);
  } catch (err) {
    return toErrorResponse(err);
  }
}
