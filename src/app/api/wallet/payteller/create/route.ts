// Phase 2 PayTeller (Nov 2026): start a Ghana MoMo deposit through
// PayTeller hosted checkout. Creates the local PaytellerPayment row,
// then the PayTeller payment — the customer is redirected to the
// returned checkout_url and pays there. No money moves here: the wallet
// only credits from the webhook / status poll after verification.
//
// Guards, in order: signed in, not blocked, GHS account only (NGN users
// never reach this), an email on file (PayTeller requires customer_email
// — see POST /api/wallet/payteller/email), a MoMo method, the amount
// inside the currency minimum and the PayTeller 0.01–1,000,000 band,
// the owner toggle set to PayTeller, the method enabled, and credentials configured.
import { randomBytes } from "node:crypto";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { getCurrencyConfig, getPaymentMethodConfig } from "@/lib/game-config";
import { checkDepositLimit } from "@/lib/limits";
import { getGhMomoGateway } from "@/lib/gateway-settings";
import {
  createPayment,
  PaytellerError,
  toAmountString,
  type PaytellerPaymentResponse,
} from "@/lib/payteller";

const METHODS = ["MTN", "Telecel", "AirtelTigo"] as const;

// The return page the customer lands on after checkout. The return is
// NOT proof of payment — the page polls the status endpoint, and the
// wallet only changes when PayTeller says successful.
const RETURN_URL_BASE = "https://royale-omega.vercel.app/wallet/payteller/return";

function paytellerFail(err: unknown) {
  if (err instanceof PaytellerError) return fail(err.message, err.statusCode);
  return toErrorResponse(err);
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await readJson<{ amount?: number; method?: string }>(req);
    if (!body) return fail("Invalid JSON body");
    const amount = Number(body.amount);
    const method = body.method ?? "";
    if (!Number.isFinite(amount) || amount <= 0) return fail("Amount must be > 0");
    if (!METHODS.includes(method as (typeof METHODS)[number])) {
      return fail(`Method must be one of: ${METHODS.join(", ")}`);
    }

    const me = await prisma.user.findUnique({ where: { id: user.id } });
    if (me?.blockedAt) return fail("This account is blocked and cannot deposit", 403);
    // PayTeller is GHS only — an NGN account never gets a PayTeller button.
    if ((me?.currency ?? "GHS") !== "GHS") {
      return fail("PayTeller is available for Ghana cedi accounts only");
    }
    // PayTeller requires a valid customer_email and sends the receipt
    // there. Phone-only users add one first (POST /api/wallet/payteller/email).
    if (!me?.email) {
      return fail("Add an email to your account to deposit with PayTeller", 400);
    }

    const currencyCfg = await getCurrencyConfig("GHS");
    if (amount < currencyCfg.minDeposit) {
      return fail(`Minimum PayTeller deposit is GH₵ ${currencyCfg.minDeposit.toFixed(2)}`);
    }
    try {
      toAmountString(amount);
    } catch {
      return fail("Amount must be between GH₵ 0.01 and GH₵ 1,000,000.00");
    }

    // The owner toggle decides whether Ghana MoMo is PayTeller or demo.
    const gateway = await getGhMomoGateway();
    if (gateway !== "payteller") {
      return fail("PayTeller is not the active Ghana gateway", 503);
    }

    // P0 Batch 2 (O12): a disabled method stays disabled on PayTeller
    // too — the owner disabling MTN must stop PayTeller MTN deposits.
    const pm = await getPaymentMethodConfig(method, "GHS");
    if (!pm.enabled) return fail(`${method} deposits are currently disabled`, 403);

    // P1 Batch 1 (A20): per-player daily deposit max — fail fast here;
    // the credit itself never fails for money already paid.
    const limitErr = await checkDepositLimit(user.id, amount, "GHS");
    if (limitErr) return fail(limitErr, 403);

    const reference = `RG-${randomBytes(8).toString("hex")}`;
    const returnUrl = `${RETURN_URL_BASE}?ref=${reference}`;
    const payment = await prisma.paytellerPayment.create({
      data: {
        userId: user.id,
        reference,
        amount,
        fiatCurrency: "GHS",
        status: "pending",
      },
    });

    let created: PaytellerPaymentResponse;
    try {
      created = await createPayment({
        reference,
        amountGhs: amount,
        email: me.email,
        description: "Royale Gold wallet deposit",
        returnUrl,
      });
    } catch (err) {
      // Docs §02: retrying a reference with identical details returns
      // the original payment — surface its checkout URL instead of
      // failing. Any other provider error fails the pending row so it
      // cannot be credited later.
      if (err instanceof PaytellerError && err.statusCode === 409) {
        const original = err.providerBody as PaytellerPaymentResponse | undefined;
        if (original && typeof original.checkout_url === "string") {
          await prisma.paytellerPayment.update({
            where: { id: payment.id },
            data: {
              paytellerId: typeof original.id === "string" ? original.id : null,
              checkoutUrl: original.checkout_url,
              expiresAt: original.expires_at ? new Date(original.expires_at) : null,
              providerPayload: original as Prisma.InputJsonValue,
            },
          });
          return ok({ checkoutUrl: original.checkout_url, reference }, 201);
        }
      }
      await prisma.paytellerPayment.update({
        where: { id: payment.id },
        data: { status: "failed" },
      });
      return paytellerFail(err);
    }

    await prisma.paytellerPayment.update({
      where: { id: payment.id },
      data: {
        paytellerId: typeof created.id === "string" ? created.id : null,
        merchantNet: created.merchant_net != null ? Number(created.merchant_net) : null,
        platformCommission:
          created.platform_commission != null ? Number(created.platform_commission) : null,
        checkoutUrl: typeof created.checkout_url === "string" ? created.checkout_url : null,
        expiresAt: created.expires_at ? new Date(created.expires_at) : null,
        providerPayload: created as Prisma.InputJsonValue,
      },
    });
    if (typeof created.checkout_url !== "string") {
      return fail("PayTeller did not return a checkout URL", 502);
    }
    return ok({ checkoutUrl: created.checkout_url, reference }, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
