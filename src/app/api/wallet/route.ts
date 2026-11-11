import { requireAuth } from "@/lib/auth";
import { ok, toErrorResponse } from "@/lib/http";
import { dec } from "@/lib/money";

export async function GET() {
  try {
    const user = await requireAuth();
    return ok({ cash: dec(user.cashBalance), coins: user.coins, sim: dec(user.simBalance) });
  } catch (err) {
    return toErrorResponse(err);
  }
}
