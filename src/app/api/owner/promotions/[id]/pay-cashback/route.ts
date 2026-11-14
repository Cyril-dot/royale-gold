// P1 Batch 3 (O19): MANUAL cashback — the owner pays one cashback
// promotion for one day. There is no cron infra, so cashback is never
// automatic: this endpoint computes the day's net cash loss per
// eligible player and credits the promotion's % (capped), once per
// player per day. Paying the same day twice grants nothing new.
import { requireRole } from "@/lib/auth";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { payCashback } from "@/lib/promotions";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const owner = await requireRole("owner");
    const { id } = await params;
    const body = await readJson<{ date?: string }>(req);
    if (!body || !body.date) return fail("A date is required (YYYY-MM-DD)");
    try {
      return ok(await payCashback(id, body.date, owner.id));
    } catch (ex) {
      if (ex instanceof Error) return fail(ex.message, 400);
      throw ex;
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
