// P0 Batch 2 (O12): the owner's payment-method control — which deposit
// methods are live and their per-method min/max. Deposits stay demo
// cashier only; this toggles/limits the methods, it connects no gateway.
import { requireRole } from "@/lib/auth";
import { ok, toErrorResponse } from "@/lib/http";
import { getAllPaymentMethodConfigs } from "@/lib/game-config";

export async function GET(req: Request) {
  try {
    await requireRole("owner");
    // Phase 1 country-based (Nov 2026): ?currency= (default GHS) —
    // one row per (method, fiat).
    const sp = new URL(req.url).searchParams;
    const fiatCurrency = (sp.get("currency") || "GHS").toUpperCase();
    const methods = await getAllPaymentMethodConfigs(fiatCurrency);
    return ok({ currency: fiatCurrency, methods });
  } catch (err) {
    return toErrorResponse(err);
  }
}
