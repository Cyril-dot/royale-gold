// P0 Batch 4 (A9): the admin's downline tree — the admin at the root,
// their referred players below, and any players referred by those
// players below them, recursively (capped at 3 levels in the render).
// Gated by the "referrals" permission (it is the Referrals page's data).
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { ok, toErrorResponse } from "@/lib/http";
import { downlineTree } from "@/lib/admin";

export async function GET() {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "referrals");
    return ok(await downlineTree(admin.id));
  } catch (err) {
    return toErrorResponse(err);
  }
}
