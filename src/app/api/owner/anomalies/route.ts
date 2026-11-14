// P2 Batch 2 (O32): anomaly alerts — rule-based detection, computed
// live from the real tables. No stored rows, no ML model, no AI —
// just thresholds on the real data. See src/lib/anomalies.ts.
import { requireRole } from "@/lib/auth";
import { ok, toErrorResponse } from "@/lib/http";
import { computeAnomalies } from "@/lib/anomalies";

export async function GET() {
  try {
    await requireRole("owner");
    const result = await computeAnomalies();
    return ok(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
