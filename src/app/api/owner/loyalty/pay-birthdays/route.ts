// P2 Batch 2 (O28): pay the birthday bonuses for today — a MANUAL
// owner action (there is NO cron). Pays the configured birthday bonus
// as a bonus credit to each player whose birthday is today and who
// has not already been paid this year (one BirthdayBonusGrant row per
// player per year). A second pay the same day pays nobody.
import { requireRole } from "@/lib/auth";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { AuthError } from "@/lib/errors";
import { payBirthdayBonuses } from "@/lib/loyalty";

export async function POST() {
  try {
    const me = await requireRole("owner");
    const result = await payBirthdayBonuses(me.id);
    return ok({
      paid: result.paid,
      total: result.total,
      // Phase 1 country-based (Nov 2026): the per-fiat split — `total`
      // blends fiats when a run covers more than one.
      totalsByCurrency: result.totalsByCurrency,
      count: result.paid.length,
      alreadyPaid: result.skippedPaid,
    });
  } catch (err) {
    if (err instanceof AuthError) return toErrorResponse(err);
    if (err instanceof Error) return fail(err.message, 400);
    return toErrorResponse(err);
  }
}
