import { requireRole } from "@/lib/auth";
import { ok, toErrorResponse } from "@/lib/http";
import { commissionHistoryDays } from "@/lib/commission";

/** Every active commission day for this admin, newest first. */
export async function GET() {
  try {
    const admin = await requireRole("admin");
    return ok({ days: await commissionHistoryDays(admin.id) });
  } catch (err) {
    return toErrorResponse(err);
  }
}
