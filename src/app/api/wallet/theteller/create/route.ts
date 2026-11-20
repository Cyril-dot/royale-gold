// Nov 2026: Theteller direct MoMo push REMOVED (Chuks: PayTeller
// only). This route stays so a direct hit fails safe with a clear
// 503 instead of starting a phone prompt — or 404ing and looking
// like a missing feature. Ghana MoMo deposits go through PayTeller
// checkout (POST /api/wallet/payteller/create) or demo.
import { fail } from "@/lib/http";

export async function POST() {
  return fail(
    "Theteller direct MoMo prompt is disabled — Ghana MoMo deposits go through PayTeller checkout.",
    503,
  );
}
