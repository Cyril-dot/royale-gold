// Nov 2026 Theteller (PaySwitch) direct MoMo push: the reconcile
// cron. GET /api/cron/theteller-reconcile — no session; the
// CRON_SECRET is the auth (Bearer header, as Vercel cron sends it,
// or ?secret=). Schedule it every 5 min.
//
// Why it exists: Theteller sends NO webhook for a wallet push, so a
// customer who closes the page mid-prompt has no browser poll left
// to settle their payment. Without this, an approved prompt would
// sit pending forever — money taken, wallet never credited. The cron
// picks up pending rows older than the 5-min prompt window, asks
// Theteller directly, and settles each one through the SAME shared
// settle function the poll and the callback use (so it can never
// credit twice or resurrect a terminal row).
//
//   - charge started ("called") + provider still pending past the
//     window → failed as timed out (counts toward the block, same
//     as the status route's timeout path).
//   - charge never started ("queued") + past the window → failed
//     WITHOUT counting (our fault, no money moved).
// A row that errors on its status check is left pending and counted
// — the next run retries it; failing it could strand an approval.
// MUST stay dynamic (await connection() below): without it Next bakes
// the response at build time and the cron would reconcile a stale
// snapshot. (export const dynamic is incompatible with this repo's
// cacheComponents setting.)
import { timingSafeEqual } from "node:crypto";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { getStatus } from "@/lib/theteller";
import { failThetellerPaymentNoCount, settleThetellerPayment } from "@/lib/theteller-deposit";

export const maxDuration = 120;

const WINDOW_MS = 5 * 60 * 1000;
const BATCH = 50;

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  await connection();
  try {
    const expected = process.env.CRON_SECRET ?? "";
    if (!expected) return fail("Cron secret is not configured", 503);
    const url = new URL(req.url);
    const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const provided = bearer || url.searchParams.get("secret") || "";
    if (!secretsMatch(provided, expected)) return fail("Not found", 404);

    const cutoff = new Date(Date.now() - WINDOW_MS);
    const stale = await prisma.thetellerPayment.findMany({
      where: { status: "pending", createdAt: { lt: cutoff } },
      orderBy: { createdAt: "asc" },
      take: BATCH,
      select: { transactionId: true, chargeState: true },
    });

    let credited = 0;
    let failed = 0;
    let noCountFailed = 0;
    let stillPending = 0;
    let errors = 0;
    for (const row of stale) {
      try {
        if (row.chargeState === "queued") {
          await failThetellerPaymentNoCount(row.transactionId, "Payment could not be started — try again");
          noCountFailed += 1;
          continue;
        }
        const verified = await getStatus(row.transactionId);
        const settled = await settleThetellerPayment(row.transactionId, verified);
        if (settled.status === "successful") {
          if (settled.newlyCredited) credited += 1;
          continue;
        }
        if (settled.status === "failed") {
          failed += 1;
          continue;
        }
        // Provider still says pending past the prompt window — the
        // prompt expired. Same synthetic timeout as the status route.
        const timedOut = await settleThetellerPayment(row.transactionId, {
          code: "103",
          status: "failed",
          reason: "Timed out waiting for approval",
          transaction_id: row.transactionId,
        });
        if (timedOut.status === "failed") failed += 1;
        else stillPending += 1;
      } catch {
        // Leave the row pending; the next run retries it.
        errors += 1;
        stillPending += 1;
      }
    }
    return ok({ checked: stale.length, credited, failed, noCountFailed, stillPending, errors });
  } catch (err) {
    return toErrorResponse(err);
  }
}
