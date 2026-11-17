import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { depositsForAdminOnScoped } from "@/lib/hierarchy";
import { todayStr } from "@/lib/money";

/** Day detail: every deposit that day + day totals. ?date=YYYY-MM-DD (default today).
 * P1 Batch 4 (O24): scoped — a parent admin's day detail rolls their
 * child admins' downlines in, each row labelled with the referring admin.
 * Phase 1 country-based (Nov 2026): ?currency= (default the admin's own
 * currency) — the day's figures are in one fiat only. */
export async function GET(req: Request) {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "commission");
    const sp = new URL(req.url).searchParams;
    const date = sp.get("date") ?? todayStr();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("date must be YYYY-MM-DD");
    const fiatCurrency = (sp.get("currency") || admin.currency || "GHS").toUpperCase();
    return ok(await depositsForAdminOnScoped(admin.id, date, fiatCurrency));
  } catch (err) {
    return toErrorResponse(err);
  }
}
