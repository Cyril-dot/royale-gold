// P1 Batch 2 (A22): the owner's deposits report — every player platform-
// wide, or one admin's downline in preview (?adminId=). ?preview=1
// returns JSON (first 10 rows + total); otherwise a CSV download.
import { requireRole } from "@/lib/auth";
import { toErrorResponse } from "@/lib/http";
import { reportUserIds, serveReport } from "@/lib/reports";

export async function GET(req: Request) {
  try {
    await requireRole("owner");
    const sp = new URL(req.url).searchParams;
    const userIds = await reportUserIds(sp.get("adminId") || null);
    return await serveReport("deposits", sp, userIds);
  } catch (err) {
    return toErrorResponse(err);
  }
}
