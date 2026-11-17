import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { ok, toErrorResponse } from "@/lib/http";
import { scopedDayCommissions } from "@/lib/hierarchy";

/** Every active commission day for this admin, newest first.
 * P1 Batch 4 (O24): scoped — a parent admin's history rolls their
 * child admins' downlines in (model "mixed" when days disagree).
 * Phase 1 country-based (Nov 2026): ?currency= (default the admin's
 * own currency). */
export async function GET(req: Request) {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "commission");
    const fiatCurrency = new URL(req.url).searchParams.get("currency") || admin.currency || "GHS";
    return ok({ days: await scopedDayCommissions(admin.id, undefined, undefined, fiatCurrency) });
  } catch (err) {
    return toErrorResponse(err);
  }
}
