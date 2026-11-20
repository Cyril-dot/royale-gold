// Nov 2026 Theteller (PaySwitch) direct MoMo push: the callback
// receiver. POST /api/public/theteller-callback/<secret> — no auth
// cookie; the unguessable path token IS the auth.
//
// The docs do NOT describe a callback mechanism for direct process
// payments (they describe a redirect_url only for the hosted
// checkout), so whether PaySwitch POSTs here — and how the URL is
// configured on an account — is UNVERIFIED. The sibling BetWins
// build (20 Nov) concluded from its provider contact that Theteller
// sends NO webhook for a wallet push at all — which would make the
// status poll THE settlement path and this route a safety net that
// never fires. This route exists so it works IF the account supports
// configuring a notification URL; the poll is the primary path
// either way.
//
// The callback is ONLY a trigger: on receipt we return 200 fast,
// then re-verify through the status endpoint and act on THAT
// response via the shared settle function. A callback body alone
// never credits. Duplicate deliveries are idempotent (the settle
// claim + the terminal-state guard).
import { after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/http";
import { getThetellerCallbackSecret } from "@/lib/gateway-settings";
import { getStatus } from "@/lib/theteller";
import { settleThetellerPayment } from "@/lib/theteller-deposit";

export const maxDuration = 60;

function secretsEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb);
}

export async function POST(req: Request, ctx: { params: Promise<{ secret: string }> }) {
  try {
    const { secret } = await ctx.params;
    const configured = await getThetellerCallbackSecret().catch(() => "");
    if (!configured || !secretsEqual(secret, configured)) {
      // No secret configured, or the wrong token: 404, never a hint.
      return new Response("Not found", { status: 404 });
    }
    // Read the transaction id defensively — Theteller's callback
    // shape for process payments is undocumented: JSON body, form
    // body, or query string are all accepted.
    let transactionId = new URL(req.url).searchParams.get("transaction_id") ?? "";
    try {
      const text = await req.text();
      if (text) {
        try {
          const parsed = JSON.parse(text) as { transaction_id?: unknown };
          if (typeof parsed.transaction_id === "string") transactionId = parsed.transaction_id;
        } catch {
          const form = new URLSearchParams(text);
          transactionId = transactionId || form.get("transaction_id") || "";
        }
      }
    } catch {
      // A body we cannot read is still a 200 — the poll reconciles.
    }
    if (/^\d{12}$/.test(transactionId)) {
      const tid = transactionId;
      after(async () => {
        try {
          const payment = await prisma.thetellerPayment.findUnique({
            where: { transactionId: tid },
            select: { status: true },
          });
          if (!payment || payment.status !== "pending") return; // idempotent
          const verified = await getStatus(tid);
          await settleThetellerPayment(tid, verified);
        } catch (err) {
          // A failed re-verify leaves the row pending — the status
          // poll is the backstop. Never throw out of after().
          console.error(`[Theteller] callback re-verify ${tid} failed:`, err instanceof Error ? err.message : err);
        }
      });
    }
    return ok({ received: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
