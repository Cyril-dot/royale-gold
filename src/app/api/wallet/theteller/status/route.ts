// Nov 2026 Theteller (PaySwitch) direct MoMo push: the browser poll.
// GET /api/wallet/theteller/status?transactionId=000000000001 — auth
// + OWN payment only. The browser polls every 10 s for up to 5 min
// (the BetWins build's cadence, so we do not hammer Theteller).
//
// The poll is never proof on its own — it asks Theteller (status
// check) and, on SUCCESS, runs the shared settle function, the same
// one the callback and the initiate worker use. A provider-side
// failure (network, 502, unknown transaction) does NOT fail the poll:
// the local status is returned and the page keeps polling.
//
// Timeouts (env-overridable for rigs; defaults are the live values):
//   - charge never started ("queued" > 30 s): the process call never
//     ran, so no money moved — the row fails as "could not be
//     started" and NO block failure is recorded (our fault, not the
//     customer's).
//   - prompt unanswered (> 5 min): one final status check. The
//     provider confirming it is still pending past the prompt expiry
//     means the prompt expired — the row fails as timed out and the
//     failure IS recorded (a timeout counts toward the block). If
//     that final check itself fails (network), the row stays pending
//     — the outcome is unknown and failing it could strand money the
//     customer already approved; the browser shows the timeout state
//     and the row waits for the callback / a later poll.
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dec } from "@/lib/money";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { getStatus, ThetellerError } from "@/lib/theteller";
import { failThetellerPaymentNoCount, settleThetellerPayment } from "@/lib/theteller-deposit";

const STATUS_CHECK_AFTER_MS = 8_000;
const QUEUED_TIMEOUT_MS = Number(process.env.THETELLER_QUEUED_TIMEOUT_MS ?? 30_000);
const PENDING_TIMEOUT_MS = Number(process.env.THETELLER_PENDING_TIMEOUT_MS ?? 300_000);

export async function GET(req: Request) {
  try {
    const user = await requireAuth();
    const transactionId = new URL(req.url).searchParams.get("transactionId") ?? "";
    if (!/^\d{12}$/.test(transactionId)) return fail("transactionId is required");
    const payment = await prisma.thetellerPayment.findUnique({ where: { transactionId } });
    if (!payment || payment.userId !== user.id) return fail("Payment not found", 404);
    const amount = dec(payment.amount);
    if (payment.status === "successful") {
      return ok({ status: "successful", credited: true, amount });
    }
    if (payment.status === "failed") {
      return ok({ status: "failed", credited: false, amount, reason: payment.reason ?? null });
    }

    const ageMs = Date.now() - payment.createdAt.getTime();

    // The charge never started: no money moved, safe to fail — and
    // it is our fault, so no block failure is recorded.
    if (payment.chargeState === "queued" && ageMs > QUEUED_TIMEOUT_MS) {
      await failThetellerPaymentNoCount(transactionId, "Payment could not be started — try again");
      return ok({ status: "failed", credited: false, amount, reason: "Payment could not be started — try again" });
    }

    // Past the prompt window: one final status check. The provider
    // confirming "still pending" past expiry means the prompt is
    // dead — fail it as timed out (that failure counts). A check
    // that itself fails leaves the row pending: the outcome is
    // unknown and failing it could strand an approved payment.
    if (ageMs > PENDING_TIMEOUT_MS) {
      try {
        const verified = await getStatus(transactionId);
        const settled = await settleThetellerPayment(transactionId, verified);
        if (settled.status === "successful") {
          return ok({ status: "successful", credited: settled.newlyCredited, amount });
        }
        if (settled.status === "failed") {
          return ok({ status: "failed", credited: false, amount, reason: settled.reason });
        }
        // Still pending after the final check — the prompt expired.
        const timedOut = await settleThetellerPayment(transactionId, {
          code: "103",
          status: "failed",
          reason: "Timed out waiting for approval",
          transaction_id: transactionId,
        });
        return ok({ status: "failed", credited: false, amount, reason: timedOut.reason ?? "Timed out waiting for approval" });
      } catch {
        return ok({ status: "pending", credited: false, amount, timedOut: true });
      }
    }

    // Still in flight: ask Theteller directly once the row is old
    // enough for an answer to exist.
    if (ageMs > STATUS_CHECK_AFTER_MS) {
      try {
        const verified = await getStatus(transactionId);
        const settled = await settleThetellerPayment(transactionId, verified);
        if (settled.status === "successful") {
          return ok({ status: "successful", credited: settled.newlyCredited, amount });
        }
        if (settled.status === "failed") {
          return ok({ status: "failed", credited: false, amount, reason: settled.reason });
        }
        return ok({ status: "pending", credited: false, amount });
      } catch (err) {
        // Theteller unreachable or the payment unknown there — return
        // the local status and let the page keep polling; the
        // callback may still settle it.
        if (err instanceof ThetellerError) {
          return ok({ status: "pending", credited: false, amount });
        }
        throw err;
      }
    }
    return ok({ status: "pending", credited: false, amount });
  } catch (err) {
    return toErrorResponse(err);
  }
}
