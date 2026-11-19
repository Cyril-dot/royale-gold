// Payment blocks (Nov 2026): owner-only early lift. Audit-logged
// (action "payment_block.lift"). A lift before
// rg-payment-blocks.sql has run fails with a plain 503 telling the
// owner to run the SQL first — never a 500.
import { requireRole } from "@/lib/auth";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { liftPaymentBlock } from "@/lib/payment-blocks";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const owner = await requireRole("owner");
    const { id } = await params;
    if (!id) return fail("Block id is required");
    try {
      const lifted = await liftPaymentBlock(id, owner.id);
      if (!lifted) return fail("Payment block not found", 404);
      return ok({ lifted: true, id });
    } catch (err) {
      if (err instanceof Error && err.message.includes("rg-payment-blocks.sql")) {
        return fail(err.message, 503);
      }
      throw err;
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
