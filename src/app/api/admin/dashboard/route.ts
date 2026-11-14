// P0 Batch 4 (A1): the enhanced admin dashboard — "today so far", the
// last 7 days of deposits, and the top 5 players by total deposited.
// Gated by the "overview" permission (it is the Overview page's data).
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { ok, toErrorResponse } from "@/lib/http";
import { adminDashboard } from "@/lib/admin";

export async function GET() {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "overview");
    return ok(await adminDashboard(admin.id));
  } catch (err) {
    return toErrorResponse(err);
  }
}
