// P1 Batch 3 (O19): pause / resume a promotion. A paused promotion
// grants nothing new; grants already made stay in the ledger.
import { requireRole } from "@/lib/auth";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { togglePromotion } from "@/lib/promotions";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const owner = await requireRole("owner");
    const { id } = await params;
    const body = await readJson<{ active?: boolean }>(req);
    if (!body || typeof body.active !== "boolean") return fail("active (true/false) is required");
    try {
      return ok(await togglePromotion(id, body.active, owner.id));
    } catch (ex) {
      if (ex instanceof Error) return fail(ex.message, 400);
      throw ex;
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
