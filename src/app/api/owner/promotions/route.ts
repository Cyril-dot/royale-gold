// P1 Batch 3 (O19): the owner's promotion engine — list + create.
// Promotions are the owner's campaigns (deposit_match, free_coins,
// cashback). No wagering requirements anywhere (there is no wagering
// system in this codebase). Cashback is paid by a MANUAL owner action
// (POST /api/owner/promotions/[id]/pay-cashback), never automatic.
import { requireRole } from "@/lib/auth";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { createPromotion, listPromotions } from "@/lib/promotions";

export async function GET() {
  try {
    await requireRole("owner");
    return ok(await listPromotions());
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const owner = await requireRole("owner");
    const body = await readJson<{
      name?: string;
      type?: string;
      percent?: number;
      cap?: number | null;
      coinAmount?: number | null;
      trigger?: string | null;
      startAt?: string;
      endAt?: string | null;
      targetAdminId?: string | null;
    }>(req);
    if (!body) return fail("Invalid JSON body");
    if (!body.startAt) return fail("A start date is required (YYYY-MM-DD)");
    try {
      const promo = await createPromotion(
        {
          name: body.name ?? "",
          type: body.type ?? "",
          percent: body.percent,
          cap: body.cap,
          coinAmount: body.coinAmount,
          trigger: body.trigger,
          startAt: body.startAt,
          endAt: body.endAt,
          targetAdminId: body.targetAdminId,
        },
        owner.id,
      );
      return ok({ promotion: { id: promo.id, name: promo.name, type: promo.type } }, 201);
    } catch (ex) {
      if (ex instanceof Error) return fail(ex.message, 400);
      throw ex;
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
