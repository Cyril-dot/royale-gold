// Nov 2026 Flutterwave v3 (Nigeria only): start a Nigerian NGN deposit
// through Flutterwave's standard hosted checkout. Creates the local
// FlutterwavePayment row, then creates the Flutterwave payment (POST
// /v3/payments). The customer is redirected to the returned link and
// pays there — card, bank transfer, USSD or bank account, the customer
// picks on the checkout page. Creating a payment does NOT charge the
// customer. No money moves here: the wallet only credits from the
// webhook / status poll after a verify.
//
// Guards, in order: signed in, not blocked, NGN account only (GHS
// users never reach this — PayTeller is Ghana's path), an email on
// file (Flutterwave requires customer.email), the amount inside the
// currency minimum, the owner toggle set to flutterwave, Flutterwave
// set up (columns exist), credentials configured, and the per-player
// daily deposit max. NO MoMo number for NG — Flutterwave's checkout
// collects the payment details itself.
import { randomBytes } from "node:crypto";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { getCurrencyConfig } from "@/lib/game-config";
import { checkDepositLimit } from "@/lib/limits";
import { getNgGateway, isFlutterwaveSetup } from "@/lib/gateway-settings";
// Fixed deposit amount (Nov 2026, owner feature) — server-side
// enforcement, see the check below.
import { enforceFixedDeposit } from "@/lib/fixed-deposit";
import {
  FlutterwaveError,
  initializePayment,
  type FlutterwavePaymentResponse,
} from "@/lib/flutterwave";
// Payment blocks (Nov 2026): two failed Flutterwave deposits in 24h
// block the account AND the number from deposits for 24h. The guard
// runs before any provider call; a start the provider rejects records
// a failure. Nigerian accounts have no saved MoMo number — the block
// keys on the account and on the login phone when one is on file.
import {
  assertPaymentsNotBlocked,
  normalizePhone,
  PaymentBlockedError,
  recordDepositFailure,
} from "@/lib/payment-blocks";

// The return page the customer lands on after checkout. The return is
// NOT proof of payment — the page polls the status endpoint, and the
// wallet only changes when Flutterwave says successful.
const RETURN_URL_BASE = "https://royale-omega.vercel.app/wallet/flutterwave/return";

function flutterwaveFail(err: unknown) {
  if (err instanceof FlutterwaveError) return fail(err.message, err.statusCode);
  return toErrorResponse(err);
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await readJson<{ amount?: number }>(req);
    if (!body) return fail("Invalid JSON body");
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return fail("Amount must be > 0");

    const me = await prisma.user.findUnique({ where: { id: user.id } });
    if (me?.blockedAt) return fail("This account is blocked and cannot deposit", 403);
    // Payment blocks (Nov 2026): the guard runs before any provider
    // call, so a blocked user never burns a Flutterwave start. The 403
    // carries code + blockedUntil so the modal shows the card.
    const phoneNumber = normalizePhone(me?.phone ?? null);
    try {
      await assertPaymentsNotBlocked({ userId: user.id, phoneNumber });
    } catch (err) {
      if (err instanceof PaymentBlockedError) {
        return fail(err.message, 403, { code: err.code, blockedUntil: err.blockedUntil });
      }
      throw err;
    }
    // Flutterwave is NGN only — a GHS account never gets a Flutterwave button.
    if ((me?.currency ?? "NGN") !== "NGN") {
      return fail("Flutterwave is available for Nigerian naira accounts only");
    }
    // Flutterwave requires a valid customer email and sends the receipt
    // there. Phone-only users add one first (POST /api/wallet/payteller/email
    // — it only sets the email on file, it is not PayTeller-specific).
    if (!me?.email) {
      return fail("Add an email to your account to deposit with Flutterwave", 400);
    }

    const currencyCfg = await getCurrencyConfig("NGN");
    if (amount < currencyCfg.minDeposit) {
      return fail(`Minimum Flutterwave deposit is ₦ ${currencyCfg.minDeposit.toFixed(2)}`);
    }
    // Fixed deposit amount (Nov 2026, owner feature): when the owner
    // has fixed the NGN deposit amount, a Flutterwave checkout may only
    // start for exactly that amount. Deliberately NOT enforced again
    // at credit time (webhook / status poll): by then the customer has
    // already paid, and rejecting a paid payment would strand money.
    const fixedErr = await enforceFixedDeposit(amount, "NGN");
    if (fixedErr) return fail(fixedErr);

    // The owner toggle decides whether Nigeria is Flutterwave or demo.
    const gateway = await getNgGateway();
    if (gateway !== "flutterwave") {
      return fail("Flutterwave is not the active Nigeria gateway", 503);
    }
    // Flutterwave set up (Nov 2026): the columns must exist before a
    // payment can start — a missing table/column fails closed with a
    // 503 naming the SQL, never a bare 500.
    if (!(await isFlutterwaveSetup())) {
      return fail("Flutterwave payments are not set up yet — run rg-flutterwave.sql in Neon first", 503);
    }

    // P1 Batch 1 (A20): per-player daily deposit max — fail fast here;
    // the credit itself never fails for money already paid.
    const limitErr = await checkDepositLimit(user.id, amount, "NGN");
    if (limitErr) return fail(limitErr, 403);

    const reference = `RG-${randomBytes(8).toString("hex")}`;
    const returnUrl = `${RETURN_URL_BASE}?ref=${reference}`;
    let payment;
    try {
      payment = await prisma.flutterwavePayment.create({
        data: {
          userId: user.id,
          reference,
          amount,
          fiatCurrency: "NGN",
          status: "pending",
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code === "P2021" || (err as { code?: string }).code === "P2022") {
        return fail("Flutterwave payments are not set up yet — run rg-flutterwave.sql in Neon first", 503);
      }
      throw err;
    }

    let created: { link: string; response: FlutterwavePaymentResponse };
    try {
      created = await initializePayment({
        reference,
        amountNgn: amount,
        email: me.email,
        name: me.name,
        phone: phoneNumber,
        userId: user.id,
        redirectUrl: returnUrl,
      });
    } catch (err) {
      await prisma.flutterwavePayment.update({
        where: { id: payment.id },
        data: { status: "failed" },
      });
      // Payment blocks (Nov 2026): the provider rejected this start —
      // a genuine failure.
      await recordDepositFailure({
        userId: user.id,
        phoneNumber,
        depositRef: reference,
      });
      return flutterwaveFail(err);
    }

    await prisma.flutterwavePayment.update({
      where: { id: payment.id },
      data: {
        checkoutUrl: created.link,
        providerPayload: created.response as Prisma.InputJsonValue,
      },
    });
    return ok({ checkoutUrl: created.link, reference }, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
