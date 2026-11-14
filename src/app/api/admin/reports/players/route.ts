// P1 Batch 2 (A22): the admin's players report — their own downline only.
// ?preview=1 returns JSON (first 10 rows + total) for the on-screen
// preview; otherwise the full report downloads as a CSV.
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { toErrorResponse } from "@/lib/http";
import { reportUserIds, serveReport } from "@/lib/reports";

export async function GET(req: Request) {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "reports");
    const userIds = await reportUserIds(admin.id);
    return await serveReport("players", new URL(req.url).searchParams, userIds);
  } catch (err) {
    return toErrorResponse(err);
  }
}
