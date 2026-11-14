// P0 Batch 2 (O12): the owner's payment-method control — which deposit
// methods are live and their per-method min/max. Deposits stay demo
// cashier only; this toggles/limits the methods, it connects no gateway.
import { requireRole } from "@/lib/auth";
import { ok, toErrorResponse } from "@/lib/http";
import { getAllPaymentMethodConfigs } from "@/lib/game-config";

export async function GET() {
  try {
    await requireRole("owner");
    const methods = await getAllPaymentMethodConfigs();
    return ok({ methods });
  } catch (err) {
    return toErrorResponse(err);
  }
}
