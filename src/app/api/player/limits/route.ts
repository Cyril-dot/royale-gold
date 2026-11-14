// P2 Batch 1 (A29): the signed-in player's own limits — the account
// page reads this for the self-exclusion banner + the "Take a break"
// section, and the game room reads it for the reality check. Nothing
// here is admin-only data; the player sees only their own row.
import { requireAuth } from "@/lib/auth";
import { ok, toErrorResponse } from "@/lib/http";
import { getPlayerLimit } from "@/lib/limits";

export async function GET() {
  try {
    const user = await requireAuth();
    const limits = await getPlayerLimit(user.id);
    return ok({
      limits: limits ?? {
        maxStake: null,
        maxDepositPerDay: null,
        maxLossPerDay: null,
        coolOffUntil: null,
        selfExcludedUntil: null,
        selfExclusionReason: null,
        realityCheckMinutes: 0,
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
