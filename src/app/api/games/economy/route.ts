import { requireAuth } from "@/lib/auth";
import { getEconomyForUser } from "@/lib/economy";
import { ok, toErrorResponse } from "@/lib/http";

/**
 * The user's SIM-vs-LIVE economy snapshot: lifetime deposits, the LIVE
 * win-chance factor those deposits imply, and the SIM boost. This is
 * what the Settings page shows so the adjustment is disclosed, not hidden.
 */
export async function GET() {
  try {
    const user = await requireAuth();
    const economy = await getEconomyForUser(user.id);
    return ok({ userId: user.id, ...economy });
  } catch (err) {
    return toErrorResponse(err);
  }
}
