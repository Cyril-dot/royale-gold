// Payment blocks (Nov 2026): owner-only list of active 24h deposit
// blocks, soonest-unblocking first. Missing tables in prod → an
// empty list, never a 500 (the lib degrades the same way).
import { requireRole } from "@/lib/auth";
import { ok, toErrorResponse } from "@/lib/http";
import { listActiveBlocks } from "@/lib/payment-blocks";

export async function GET() {
  try {
    await requireRole("owner");
    const blocks = await listActiveBlocks();
    return ok({ blocks });
  } catch (err) {
    return toErrorResponse(err);
  }
}
