// P0 Batch 3 (O3): the admin's own identity for page headers. No section
// permission is needed here — it is the admin's own identity, and the
// page's DATA endpoint enforces the section permission. In owner preview
// mode the client uses the preview endpoint instead.
import { requireRole } from "@/lib/auth";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { adminContext } from "@/lib/admin";

export async function GET() {
  try {
    const admin = await requireRole("admin");
    const ctx = await adminContext(admin.id);
    if (!ctx) return fail("Admin not found", 404);
    return ok(ctx);
  } catch (err) {
    return toErrorResponse(err);
  }
}
