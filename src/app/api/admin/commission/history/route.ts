import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { ok, toErrorResponse } from "@/lib/http";
import { scopedDayCommissions } from "@/lib/hierarchy";

/** Every active commission day for this admin, newest first.
 * P1 Batch 4 (O24): scoped — a parent admin's history rolls their
 * child admins' downlines in (model "mixed" when days disagree). */
export async function GET() {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "commission");
    return ok({ days: await scopedDayCommissions(admin.id) });
  } catch (err) {
    return toErrorResponse(err);
  }
}
