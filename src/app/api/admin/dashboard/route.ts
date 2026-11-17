// P0 Batch 4 (A1): the enhanced admin dashboard — "today so far", the
// last 7 days of deposits, and the top 5 players by total deposited.
// Gated by the "overview" permission (it is the Overview page's data).
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { ok, toErrorResponse } from "@/lib/http";
import { adminDashboard } from "@/lib/admin";

export async function GET(req: Request) {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "overview");
    // Phase 1 country-based (Nov 2026): ?currency= (default the
    // admin's own currency).
    const fiatCurrency = new URL(req.url).searchParams.get("currency") || undefined;
    return ok(await adminDashboard(admin.id, fiatCurrency));
  } catch (err) {
    return toErrorResponse(err);
  }
}
