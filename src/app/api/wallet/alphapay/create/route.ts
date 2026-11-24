// Nov 2026 AlphaPay (Ghana only, docs.alphapay.me): start a Ghana
// GHS deposit through AlphaPay's direct MoMo push (softpay). Creates
// the local AlphaPayPayment row, then pushes the prompt straight to
// the customer's phone (POST /payments/softpay/). The customer
// approves the prompt on the phone — there is no checkout page in
// the normal case. No money moves here: the wallet only credits
// from the webhook / status poll after a verify.
//
// EXCEPTION: when the softpay response carries a non-empty
// checkout_url, the customer gets NO push — the create returns the
// checkout URL and the modal redirects there instead (the normal
// behaviour for some networks, not an edge case; the return page
// polls the status endpoint).
//
// Guards, in order: signed in, not blocked, GHS account only (NGN
// users never reach this — Flutterwave is Nigeria's path), an email
// on file (AlphaPay requires customer.email), a MoMo method, the
// amount inside the currency minimum, the owner toggle set to
// alphapay, the method enabled, and credentials configured. The
// prompt goes to the SAVED deposit number first (DepositNumber
// table — set once on the first deposit, changed only on the
// Account page), the typed number on the first deposit.
import { randomBytes, randomUUID } from "node:crypto";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { getCurrencyConfig, getPaymentMethodConfig } from "@/lib/game-config";
import { checkDepositLimit } from "@/lib/limits";
import { getGhMomoGateway, isAlphapaySetup } from "@/lib/gateway-settings";
// Fixed deposit amount (Nov 2026, owner feature) — server-side
// enforcement, see the check below.
import { enforceFixedDeposit } from "@/lib/fixed-deposit";
import {
  ALPHAPAY_NETWORKS,
  AlphaPayError,
  softpay,
} from "@/lib/alphapay";
// Deposit MoMo number (Nov 2026): set once on the first gateway
// deposit, reused after that. The block and the failure log key on
// the saved number first, the login phone second.
import {
  DEPOSIT_NUMBER_SQL,
  getDepositPhone,
  normalizeDepositPhone,
  setDepositPhone,
} from "@/lib/deposit-number";
// Payment blocks (Nov 2026): two failed AlphaPay deposits in 24h
// block the account AND the number from deposits for 24h. The guard
// runs before any provider call; a start the provider rejects records
// a failure.
import {
  assertPaymentsNotBlocked,
  normalizePhone,
  PaymentBlockedError,
  recordDepositFailure,
} from "@/lib/payment-blocks";

const METHODS = ["MTN", "Telecel", "AirtelTigo"] as const;

// Ghana MoMo prefixes (docs formats table + the live networks):
// a number whose known prefix belongs to another network is a plain
// 400 — sending an MTN number to Telecel's network would only fail
// at the provider and burn a failure. An UNKNOWN prefix is allowed
// through (new ranges exist; the provider decides).
const NETWORK_PREFIXES: Record<(typeof METHODS)[number], Set<string>> = {
  MTN: new Set(["024", "025", "053", "054", "055", "059"]),
  Telecel: new Set(["020", "050"]),
  AirtelTigo: new Set(["026", "027", "056", "057"]),
};

function networkForPhone(phone: string): (typeof METHODS)[number] | null {
  const prefix = phone.slice(0, 3);
  for (const method of METHODS) {
    if (NETWORK_PREFIXES[method].has(prefix)) return method;
  }
  return null;
}

// The return page the customer lands on after AlphaPay's hosted
// page (checkout_url branch only). The return is NOT proof of
// payment — the page polls the status endpoint, and the wallet only
// changes when AlphaPay says successful.
const RETURN_URL_BASE = "https://royale-omega.vercel.app/wallet/alphapay/return";

function alphapayFail(err: unknown) {
  if (err instanceof AlphaPayError) return fail(err.message, err.statusCode);
  return toErrorResponse(err);
}

/** "Kwame Mensah" → ["Kwame", "Mensah"]; single word → last name falls back to the email local part. */
function splitName(name: string | null | undefined, email: string): [string, string] {
  const local = String(email).split("@")[0] || "Player";
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return [local, local];
  if (parts.length === 1) return [parts[0], local];
  return [parts[0], parts.slice(1).join(" ")];
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await readJson<{ amount?: number; method?: string; phone?: string }>(req);
    if (!body) return fail("Invalid JSON body");
    const amount = Number(body.amount);
    const method = body.method ?? "";
    if (!Number.isFinite(amount) || amount <= 0) return fail("Amount must be > 0");
    if (!METHODS.includes(method as (typeof METHODS)[number])) {
      return fail(`Method must be one of: ${METHODS.join(", ")}`);
    }
    const momoMethod = method as (typeof METHODS)[number];

    const me = await prisma.user.findUnique({ where: { id: user.id } });
    if (me?.blockedAt) return fail("This account is blocked and cannot deposit", 403);
    // Deposit MoMo number (Nov 2026): the SAVED number (table only)
    // and the effective number (saved first, login phone second — the
    // block keys on the effective one). They must stay separate: a
    // login phone is NOT a saved deposit number, and treating it as
    // one would skip the save below and leave the account with
    // nothing saved — the next deposit would ask again.
    const savedNumber = await getDepositPhone(user.id);
    const depositNumber = savedNumber ?? normalizePhone(me?.phone ?? null);
    // Payment blocks (Nov 2026): the guard runs before any provider
    // call, so a blocked user never burns an AlphaPay start. The 403
    // carries code + blockedUntil so the modal shows the card.
    try {
      await assertPaymentsNotBlocked({ userId: user.id, phoneNumber: depositNumber });
    } catch (err) {
      if (err instanceof PaymentBlockedError) {
        return fail(err.message, 403, { code: err.code, blockedUntil: err.blockedUntil });
      }
      throw err;
    }
    // AlphaPay is GHS only — an NGN account never gets an AlphaPay button.
    if ((me?.currency ?? "GHS") !== "GHS") {
      return fail("AlphaPay is available for Ghana cedi accounts only");
    }
    // AlphaPay requires a valid customer email and first/last name.
    if (!me?.email) {
      return fail("Add an email to your account to deposit with AlphaPay", 400);
    }

    const currencyCfg = await getCurrencyConfig("GHS");
    if (amount < currencyCfg.minDeposit) {
      return fail(`Minimum AlphaPay deposit is GH₵ ${currencyCfg.minDeposit.toFixed(2)}`);
    }
    // Fixed deposit amount (Nov 2026, owner feature): when the owner
    // has fixed the GHS deposit amount, an AlphaPay push may only
    // start for exactly that amount. Deliberately NOT enforced again
    // at credit time (webhook / status poll): by then the customer has
    // already paid, and rejecting a paid payment would strand money.
    const fixedErr = await enforceFixedDeposit(amount, "GHS");
    if (fixedErr) return fail(fixedErr);

    // The owner toggle decides whether Ghana MoMo is AlphaPay or not.
    const gateway = await getGhMomoGateway();
    if (gateway !== "alphapay") {
      return fail("AlphaPay is not the active Ghana gateway", 503);
    }
    // AlphaPay set up (Nov 2026): the columns must exist before a
    // payment can start — a missing table/column fails closed with a
    // 503 naming the SQL, never a bare 500.
    if (!(await isAlphapaySetup())) {
      return fail("AlphaPay payments are not set up yet — run rg-alphapay.sql in Neon first", 503);
    }

    // P0 Batch 2 (O12): a disabled method stays disabled on AlphaPay
    // too — the owner disabling MTN must stop AlphaPay MTN deposits.
    const pm = await getPaymentMethodConfig(method, "GHS");
    if (!pm.enabled) return fail(`${method} deposits are currently disabled`, 403);

    // P1 Batch 1 (A20): per-player daily deposit max — fail fast here;
    // the credit itself never fails for money already paid.
    const limitErr = await checkDepositLimit(user.id, amount, "GHS");
    if (limitErr) return fail(limitErr, 403);

    // Deposit MoMo number (Nov 2026): the prompt goes to the SAVED
    // number. A saved number is never overwritten by a free-typed one
    // — a body phone is ignored when one is saved. First AlphaPay
    // deposit (nothing saved — a login phone does NOT count): the
    // supplied number is required. The network check runs BEFORE the
    // save: a number that fails it must never be saved to the account
    // (the owner would have to fix it on the Account page). A missing
    // DepositNumber table in prod fails closed with a 503 naming the
    // SQL — the deposit cannot start without somewhere to save it.
    let numberToUse = depositNumber;
    if (!savedNumber) {
      const supplied = normalizeDepositPhone(body.phone);
      if (!supplied) {
        return fail("Add your MoMo number — the prompt goes to the number you set on your first deposit");
      }
      numberToUse = supplied;
    }
    if (!numberToUse) {
      return fail("Add your MoMo number — the prompt goes to the number you set on your first deposit");
    }
    // The number's network must match the method picked — an MTN
    // number pushed to Telecel's network only fails at the provider.
    const numberNetwork = networkForPhone(numberToUse);
    if (numberNetwork && numberNetwork !== momoMethod) {
      return fail(`That number is ${numberNetwork} — pick ${numberNetwork} as the method`);
    }
    if (!savedNumber) {
      try {
        numberToUse = await setDepositPhone(user.id, numberToUse);
      } catch (err) {
        if (err instanceof Error && err.message.includes(DEPOSIT_NUMBER_SQL)) {
          return fail(err.message, 503);
        }
        throw err;
      }
    }

    const reference = `RG-${randomBytes(8).toString("hex")}`;
    const idempotencyKey = randomUUID();
    const returnUrl = `${RETURN_URL_BASE}?ref=${reference}`;
    let payment;
    try {
      payment = await prisma.alphaPayPayment.create({
        data: {
          userId: user.id,
          reference,
          idempotencyKey,
          network: ALPHAPAY_NETWORKS[momoMethod],
          phone: numberToUse,
          amount,
          fiatCurrency: "GHS",
          status: "pending",
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code === "P2021" || (err as { code?: string }).code === "P2022") {
        return fail("AlphaPay payments are not set up yet — run rg-alphapay.sql in Neon first", 503);
      }
      throw err;
    }

    const [firstName, lastName] = splitName(me.name, me.email);
    let created;
    try {
      created = await softpay({
        reference,
        amountGhs: amount,
        email: me.email,
        firstName,
        lastName,
        phone: numberToUse,
        network: ALPHAPAY_NETWORKS[momoMethod],
        returnUrl,
        userId: user.id,
        idempotencyKey,
      });
    } catch (err) {
      await prisma.alphaPayPayment.update({
        where: { id: payment.id },
        data: { status: "failed" },
      });
      // Payment blocks (Nov 2026): the provider rejected this start —
      // a genuine failure.
      await recordDepositFailure({
        userId: user.id,
        phoneNumber: numberToUse,
        depositRef: reference,
      });
      return alphapayFail(err);
    }

    await prisma.alphaPayPayment.update({
      where: { id: payment.id },
      data: {
        alphapayPaymentId: created.paymentId,
        checkoutUrl: created.checkoutUrl || null,
        providerPayload: created.response as Prisma.InputJsonValue,
      },
    });
    // AlphaPay sometimes answers a push with a hosted page instead —
    // then the customer gets NO prompt and must be redirected.
    if (created.checkoutUrl) {
      return ok({ checkoutUrl: created.checkoutUrl, reference }, 201);
    }
    return ok({ reference, status: "pending" }, 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
