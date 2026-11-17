import { requireAuth } from "@/lib/auth";
import { ok, toErrorResponse } from "@/lib/http";
import { dec } from "@/lib/money";

export async function GET() {
  try {
    const user = await requireAuth();
    return ok({
      cash: dec(user.cashBalance),
      coins: user.coins,
      sim: dec(user.simBalance),
      // Phase 1 country-based (Nov 2026): the wallet's fiat + country.
      currency: user.currency ?? "GHS",
      country: user.country ?? "GH",
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
