// P0 Batch 1 (O7): the owner's global transaction ledger — the same
// ledger as the admin's (A6) but platform-wide: every player, every admin.
// Searchable by type, period, amount, currency, gateway (method) and admin.
import { requireRole } from "@/lib/auth";
import { ok, toErrorResponse } from "@/lib/http";
import { buildLedger, type LedgerType } from "@/lib/ledger";

export async function GET(req: Request) {
  try {
    await requireRole("owner");
    const sp = new URL(req.url).searchParams;
    const type = sp.get("type") as LedgerType | null;
    const minAmount = sp.get("minAmount");
    const maxAmount = sp.get("maxAmount");
    const result = await buildLedger({
      scopeAdminId: null,
      filters: {
        type: type && ["deposit", "bet", "withdrawal", "adjustment", "conversion", "payout"].includes(type) ? type : undefined,
        q: sp.get("q") || undefined,
        from: sp.get("from") || undefined,
        to: sp.get("to") || undefined,
        adminId: sp.get("adminId") || undefined,
        method: sp.get("method") || undefined,
        minAmount: minAmount !== null ? Number(minAmount) : undefined,
        maxAmount: maxAmount !== null ? Number(maxAmount) : undefined,
        userId: sp.get("userId") || undefined,
        limit: Number(sp.get("limit") ?? 50) || 50,
      },
    });
    return ok(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
