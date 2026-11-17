import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { adminOverview } from "@/lib/admin";

export async function GET(req: Request) {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "overview");
    // Phase 1 country-based (Nov 2026): ?currency= (default the
    // admin's own currency).
    const fiatCurrency = new URL(req.url).searchParams.get("currency") || undefined;
    const payload = await adminOverview(admin.id, fiatCurrency);
    if (!payload) return fail("Admin not found", 404);
    return ok(payload);
  } catch (err) {
    return toErrorResponse(err);
  }
}
