// P0 Batch 1 (A6): the admin's transaction ledger — every money movement
// for the admin's own players (deposit, bet, withdrawal, adjustment,
// conversion), searchable and filterable. Built only from rows the tables
// actually hold; see src/lib/ledger.ts.
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { ok, toErrorResponse } from "@/lib/http";
import { buildLedger, type LedgerType } from "@/lib/ledger";

export async function GET(req: Request) {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "money");
    const sp = new URL(req.url).searchParams;
    const type = sp.get("type") as LedgerType | null;
    const minAmount = sp.get("minAmount");
    const maxAmount = sp.get("maxAmount");
    const result = await buildLedger({
      scopeAdminId: admin.id,
      filters: {
        type: type && ["deposit", "bet", "withdrawal", "adjustment", "conversion", "payout"].includes(type) ? type : undefined,
        q: sp.get("q") || undefined,
        from: sp.get("from") || undefined,
        to: sp.get("to") || undefined,
        method: sp.get("method") || undefined,
        minAmount: minAmount !== null ? Number(minAmount) : undefined,
        maxAmount: maxAmount !== null ? Number(maxAmount) : undefined,
        userId: sp.get("userId") || undefined,
        limit: Number(sp.get("limit") ?? 50) || 50,
        // Phase 1 country-based (Nov 2026): ?currency= (default the
        // admin's own currency) — rows + totals in one fiat only.
        fiatCurrency: (sp.get("currency") || admin.currency || "GHS").toUpperCase(),
      },
    });
    return ok(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
