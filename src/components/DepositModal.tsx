// Deposit modal — demo cashier (POST /api/wallet/deposit) by default.
// Phase 2 PayTeller (Nov 2026): when the player's fiat is GHS and the
// owner toggle has Ghana MoMo on PayTeller, the MTN / Telecel /
// AirtelTigo buttons start a PayTeller payment instead (POST
// /api/wallet/payteller/create → redirect to checkout_url, where the
// MoMo prompt is triggered — PayTeller has no direct-push endpoint).
// The confirm card's "Deposit" opens a Yes/No popup first; Yes
// initiates, No goes back and sends nothing. Card stays demo, and
// NGN users never see the PayTeller path.
// Nov 2026 Flutterwave v3 (Nigeria only): when the player's fiat is
// NGN and the owner toggle has Nigeria on Flutterwave, the deposit
// starts a Flutterwave payment instead (POST
// /api/wallet/flutterwave/create → redirect to the checkout link,
// where the customer pays by card, bank transfer, USSD or bank
// account — Flutterwave's checkout collects the details itself, so
// there is no MoMo number and no method picker for NG). The fee is
// ₦0.00 for the customer — the house absorbs Flutterwave's ~2%, so
// the total is exactly the deposit. GHS users never see this path.
// Nov 2026: Theteller direct MoMo push REMOVED (Chuks: PayTeller
// only) — the modal goes PayTeller checkout or demo, never a direct
// phone prompt; there is no "Check your phone" screen any more.
// Nov 2026 AlphaPay (Ghana only, docs.alphapay.me): the direct push
// is BACK, on AlphaPay — when the owner's Ghana toggle is AlphaPay,
// the MTN / Telecel / AirtelTigo buttons start an AlphaPay softpay
// instead (POST /api/wallet/alphapay/create → the prompt goes
// straight to the phone; the modal waits and polls the status
// endpoint every 5 s until it succeeds, fails or times out). If
// AlphaPay answers with a checkout_url instead of a push, the modal
// redirects there (the return page polls the same way). The fee is
// GH₵0.00 for the customer — the house absorbs AlphaPay's fee, so
// the total is exactly the deposit.
// Deposit MoMo number (Nov 2026): set ONCE on the first gateway
// deposit, saved to the account, reused after that — the confirm card
// and the popup show the saved number, and the number is changed only
// on the Account page. The server enforces the saved number over
// anything the client sends.
// PayTeller needs a customer email: a phone-only GHS user is prompted
// to add one here first (POST /api/wallet/payteller/email — the phone
// stays on the account); until then PayTeller is blocked with a clear
// message and the demo card still works.

"use client";

import { useEffect, useState } from "react";
import { api, ApiError, fmtMoney, Wallet, User } from "../lib/api";
import { symbolFor } from "../lib/country";
import { useStore } from "../lib/store";

const METHODS = ["MTN", "Telecel", "AirtelTigo", "card"] as const;
const MOMO_METHODS = ["MTN", "Telecel", "AirtelTigo"] as const;

const NETWORK_LABEL: Record<string, string> = {
  MTN: "MTN MoMo",
  Telecel: "Telecel Cash",
  AirtelTigo: "AirtelTigo Money",
};

/** "Fri 20 Nov, 20:45" — the same en-GB shape the server uses. */
function formatBlockedUntil(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "later";
  return when.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DepositModal() {
  const { depositOpen, setDepositOpen, setWallet, setUser, toast, user, refresh } = useStore();
  // Phase 1 country-based (Nov 2026): the modal shows the player's own
  // fiat symbol, and only that fiat's methods apply (the server
  // enforces it — the method list is the same for both fiats in demo).
  const fiat = user?.currency ?? "GHS";
  const sym = symbolFor(fiat);
  const [amount, setAmount] = useState(100);
  const [method, setMethod] = useState<(typeof METHODS)[number]>("MTN");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Payment blocks (Nov 2026): a live 24h block replaces the whole
  // form with the blocked card — never a red error line. Set from the
  // status check on open, or from a 403 with code "payment_blocked"
  // on submit (a block that landed after the modal opened).
  const [blockedUntil, setBlockedUntil] = useState<string | null>(null);
  // Pre-pay confirm (Nov 2026, PayTeller only): "confirm" shows the
  // card with the real totals before anything is sent; "ask" is the
  // Yes/No popup — Yes initiates the payment, No goes back to the
  // confirm card and sends nothing. The demo path never enters
  // either — play money, no real MoMo charge to confirm.
  const [step, setStep] = useState<"form" | "confirm" | "ask" | "waiting">("form");
  // Nov 2026 AlphaPay (Ghana only): the waiting state — the prompt
  // is out and the modal polls the status endpoint every 5 s until
  // it succeeds, fails or times out (5 min). waitRef is the RG-
  // reference the status poll needs; the poll lives in an effect
  // below so closing the modal (or leaving the step) stops it.
  const [waitRef, setWaitRef] = useState("");
  const [waitAmount, setWaitAmount] = useState<number | null>(null);
  // Phase 2 PayTeller (Nov 2026): the live Ghana gateway, read from the
  // public config when the modal opens. null = not loaded yet (treated
  // as demo until it arrives, so the button never flickers gateways).
  const [gateway, setGateway] = useState<string | null>(null);
  // Nov 2026 Flutterwave v3 (Nigeria only): the live Nigeria gateway,
  // same pattern — null = not loaded yet (treated as flutterwave until
  // it arrives, the live-by-default value).
  const [ngGateway, setNgGateway] = useState<string | null>(null);
  // Country-based min-deposit hint (Nov 2026): the player's fiat
  // minimum from the same config call (GHS 1, NGN 100 seed) — a hint
  // only, the server still enforces it.
  const [minDeposit, setMinDeposit] = useState<number | null>(null);
  // Fixed deposit amount (Nov 2026, owner feature): when the owner has
  // fixed this fiat's deposit amount, every deposit must be exactly
  // that amount — the input locks to it (server-enforced too).
  const [fixedDeposit, setFixedDeposit] = useState<number | null>(null);
  // Phase 2 PayTeller (Nov 2026): the email-on-file prompt for
  // phone-only GHS users (PayTeller requires customer_email).
  const [emailInput, setEmailInput] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState("");
  // The referring admin's actual commission % (from the referral code's
  // owner). Null = no referring admin / no pct on file — the sentence is
  // hidden then instead of showing a blank %.
  const [refPct, setRefPct] = useState<number | null>(null);
  // Deposit MoMo number (Nov 2026): the number saved on the account
  // (null = never set — this is the first PayTeller deposit, so the
  // form asks for it once). Fetched fresh every open. The demo path
  // never reads it — no prompt goes out there.
  const [savedNumber, setSavedNumber] = useState<string | null>(null);
  // The number typed on a first PayTeller deposit (only shown when
  // nothing is saved yet). Sent with the create call; the server
  // saves it, then ignores any typed number on later deposits.
  const [depPhone, setDepPhone] = useState("");
  useEffect(() => {
    if (!depositOpen || !user?.referralCodeUsed) { setRefPct(null); return; }
    let live = true;
    api<{ valid: boolean; commissionPct?: number | null }>(`/api/referral/validate?code=${encodeURIComponent(user.referralCodeUsed)}`)
      .then((r) => { if (live) setRefPct(r.valid && r.commissionPct != null ? r.commissionPct : null); })
      .catch(() => { if (live) setRefPct(null); });
    return () => { live = false; };
  }, [depositOpen, user?.referralCodeUsed]);

  useEffect(() => {
    if (!depositOpen) return;
    let live = true;
    api<{ ghMomoGateway?: string; ngGateway?: string; currencies?: { currency: string; minDeposit: number; fixedDepositAmount?: number | null }[] }>("/api/games/config")
      .then((r) => {
        if (!live) return;
        setGateway(r.ghMomoGateway ?? "payteller");
        // Nov 2026 Flutterwave v3 (Nigeria only): the live Nigeria
        // gateway from the same config call.
        setNgGateway(r.ngGateway ?? "flutterwave");
        const row = r.currencies?.find((c) => c.currency === fiat);
        if (row && row.minDeposit > 0) setMinDeposit(row.minDeposit);
        // Fixed amount: lock the modal to it when set (null = OFF).
        // Fetched fresh every time the modal opens, so an owner change
        // mid-session shows up on the next open.
        const fixed = row?.fixedDepositAmount ?? null;
        setFixedDeposit(fixed !== null && fixed > 0 ? fixed : null);
        if (fixed !== null && fixed > 0) setAmount(fixed);
      })
      .catch(() => { if (live) { setGateway("payteller"); setNgGateway("flutterwave"); } });
    // Payment blocks (Nov 2026): ask up front so a blocked user sees
    // the card immediately instead of filling the form and failing.
    // A missing-tables prod answers "not blocked" — never an error.
    api<{ blocked: boolean; blockedUntil?: string | null }>("/api/wallet/payment-block")
      .then((r) => { if (live) setBlockedUntil(r.blocked ? r.blockedUntil ?? null : null); })
      .catch(() => { if (live) setBlockedUntil(null); });
    // Deposit MoMo number (Nov 2026): the saved number, or null when
    // this is the first PayTeller deposit. A missing-table prod
    // answers null — the form asks once, as designed.
    api<{ depositPhone?: string | null }>("/api/wallet/deposit-number")
      .then((r) => { if (live) setSavedNumber(r.depositPhone ?? null); })
      .catch(() => { if (live) setSavedNumber(null); });
    return () => { live = false; };
  }, [depositOpen, fiat]);

  // Escape closes the modal (same fix as AuthModal, round 6).
  useEffect(() => {
    if (!depositOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDepositOpen(false); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [depositOpen, setDepositOpen]);

  // Nov 2026 AlphaPay (Ghana only): the waiting poll — while the
  // step is "waiting" and a reference is set, poll the status
  // endpoint every 5 s for up to 5 minutes (60 polls). SUCCESS lands
  // the wallet: refresh + close + go to /wallet. FAILED goes back to
  // the form with a plain line — or swaps in the blocked card when
  // the failure just tripped the payment block (the status call
  // carries blockedUntil then). TIMEOUT stops with a plain line.
  // Leaving the step or closing the modal clears the interval.
  useEffect(() => {
    if (step !== "waiting" || !waitRef) return;
    let live = true;
    let polls = 0;
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const poll = async () => {
      polls += 1;
      try {
        const r = await api<{ status: string; credited: boolean; amount: number; blockedUntil?: string }>(
          `/api/wallet/alphapay/status?reference=${encodeURIComponent(waitRef)}`,
        );
        if (!live) return;
        if (r.status === "successful") {
          stop();
          if (r.credited) await refresh();
          setDepositOpen(false);
          window.location.href = "/wallet";
          return;
        }
        if (r.status === "failed") {
          stop();
          if (r.blockedUntil) {
            setBlockedUntil(r.blockedUntil);
          } else {
            setErr("AlphaPay says this payment did not complete — your wallet was not credited. Try the deposit again.");
          }
          setStep("form");
          return;
        }
      } catch (ex) {
        if (!live) return;
        if (ex instanceof Error && /not signed in/i.test(ex.message)) {
          stop();
          setErr("Your session ended before the payment could be checked — sign in and try again.");
          setStep("form");
          return;
        }
        // Any other poll failure is transient: keep polling to the cap.
      }
      if (polls >= 60) {
        stop();
        if (live) {
          setErr("AlphaPay has not confirmed yet — check your wallet History; it updates automatically once it does.");
          setStep("form");
        }
      }
    };
    void poll();
    timer = setInterval(() => void poll(), 5000);
    return () => { live = false; stop(); };
  }, [step, waitRef, refresh, setDepositOpen]);

  // Fresh state on every open: the step and the block never carry
  // over from the last time the modal was shown. Adjusted during
  // render (the supported pattern — never in an effect, which the
  // linter flags as a cascading render).
  if (!depositOpen) {
    if (step !== "form" || blockedUntil !== null || err !== "" || waitRef !== "") {
      setStep("form");
      setBlockedUntil(null);
      setErr("");
      setWaitRef("");
    }
    return null;
  }
  const paytellerActive =
    fiat === "GHS" && gateway === "payteller" && (MOMO_METHODS as readonly string[]).includes(method);
  // Nov 2026 AlphaPay (Ghana only, docs.alphapay.me): GHS + the
  // owner toggle on AlphaPay + a MoMo method. The prompt goes
  // straight to the phone — no checkout page in the normal case.
  const alphapayActive =
    fiat === "GHS" && gateway === "alphapay" && (MOMO_METHODS as readonly string[]).includes(method);
  // Nov 2026 Flutterwave v3 (Nigeria only): NGN + the owner toggle on
  // Flutterwave. No method applies — the customer picks card, bank
  // transfer, USSD or bank account on Flutterwave's checkout page.
  const flutterwaveActive = fiat === "NGN" && ngGateway === "flutterwave";
  // Nov 2026: the live gateway is PayTeller (GH checkout) or
  // AlphaPay (GH direct push) or Flutterwave (NG checkout).
  const gatewayActive = paytellerActive || flutterwaveActive || alphapayActive;
  // The gateway's name, for the email prompt and error lines.
  const gatewayName = flutterwaveActive ? "Flutterwave" : alphapayActive ? "AlphaPay" : "PayTeller";
  // PayTeller and AlphaPay both use the saved MoMo number (set once
  // on the first deposit); Flutterwave never asks for one.
  const momoNumberActive = paytellerActive || alphapayActive;
  // The Yes/No popup can only be reached from the confirm card; if
  // the gateway or method changed under it, fall back to the form
  // rather than asking about a payment that can no longer start.
  const askOpen = step === "ask" && gatewayActive;
  // What the customer authorizes on PayTeller: principal + the 2%
  // Theteller MoMo fee (docs §05). The wallet is credited the full
  // principal once PayTeller confirms — the fee is on top, not out of it.
  const paytellerTotal = Math.round(amount * 1.02 * 100) / 100;
  // The 2% Theteller MoMo fee, on top of the principal — shown as its
  // own row on the confirm card so the total is never a surprise.
  const paytellerFee = Math.round((paytellerTotal - amount) * 100) / 100;
  const confirmTotal = paytellerActive ? paytellerTotal : amount;
  // Nov 2026 Flutterwave v3 (Nigeria only): the customer pays exactly
  // the deposit — Flutterwave's ~2% fee is on the house, so the fee
  // row reads ₦0.00 and the total is the deposit.
  const flutterwaveFee = 0;
  // Nov 2026 AlphaPay (Ghana only): the same house rule — the
  // customer pays exactly the deposit, AlphaPay's fee is on us.
  const alphapayFee = 0;
  // Deposit MoMo number (Nov 2026): the saved number when one is set,
  // otherwise the number typed on this first deposit.
  const numberToUse = savedNumber ?? depPhone.trim();

  /** Ghana MoMo number: 10 digits starting with 0 (054..., 024...). */
  const normalizeDepPhone = (raw: string): string | null => {
    const digits = raw.replace(/[\s()-]/g, "");
    const local = digits.startsWith("+233") ? `0${digits.slice(4)}` : digits;
    return /^0\d{9}$/.test(local) ? local : null;
  };

  const saveEmail = async () => {
    const v = emailInput.trim();
    setEmailMsg("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setEmailMsg("Enter a valid email address"); return; }
    setEmailBusy(true);
    try {
      const r = await api<{ user: User }>("/api/wallet/payteller/email", {
        method: "POST",
        body: JSON.stringify({ email: v }),
      });
      setUser(r.user);
      setEmailMsg("Email saved — you can pay with PayTeller now.");
    } catch (ex) {
      setEmailMsg(ex instanceof Error ? ex.message : "Could not save email");
    } finally {
      setEmailBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (gatewayActive) {
      // Flutterwave, AlphaPay and PayTeller all need an email on file
      // — the receipt goes there.
      if (!user?.email) {
        setErr(`Add an email below first — ${gatewayName} needs it for your receipt.`);
        return;
      }
      // Deposit MoMo number (Nov 2026): first PAYTELLER / ALPHAPAY
      // deposit needs the number typed once — the server saves it.
      // Later deposits reuse the saved number and never ask again.
      // Flutterwave never asks — its checkout collects the payment
      // details itself.
      if (momoNumberActive && !savedNumber && !normalizeDepPhone(depPhone)) {
        setErr("Enter a valid Ghana MoMo number (e.g. 0244 000 000)");
        return;
      }
      // Pre-pay confirm (Nov 2026): show the card with the real
      // totals first. Nothing is sent until the user confirms there.
      setStep("confirm");
      return;
    }
    // Demo cashier: play money, no provider, no prompt to confirm —
    // the deposit credits immediately, as before.
    setBusy(true);
    try {
      const r = await api<Wallet & { deposit: { amount: number; method: string; commission: number } }>("/api/wallet/deposit", {
        method: "POST",
        body: JSON.stringify({ amount, method }),
      });
      setWallet(r);
      toast(`Deposited ${fmtMoney(amount, fiat)} via ${method}`, "win");
      setDepositOpen(false);
    } catch (ex) {
      // A block that landed after the modal opened shows the card,
      // not the red line — same as the PayTeller path.
      if (ex instanceof ApiError && ex.code === "payment_blocked" && ex.blockedUntil) {
        setBlockedUntil(ex.blockedUntil);
      } else {
        setErr(ex instanceof Error ? ex.message : "Deposit failed");
      }
    } finally {
      setBusy(false);
    }
  };

  // Confirm step: only reached from "Yes" on the ask popup — Cancel
  // never calls this, and No goes back to the confirm card, so
  // neither sends anything. A 403 with code "payment_blocked" swaps
  // the card for the blocked card; any other failure goes back to the
  // form with the plain error line.
  // Nov 2026 AlphaPay (Ghana only): the direct push. The create
  // returns a reference — the prompt is on the customer's phone and
  // the modal waits (polls the status endpoint). If AlphaPay answers
  // with a checkout_url instead, there is NO prompt — redirect there
  // (the return page polls the same way). A failed create goes back
  // to the form with the plain line.
  const confirmAlphapay = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ checkoutUrl?: string; reference?: string }>(`/api/wallet/alphapay/create`, {
        method: "POST",
        body: JSON.stringify({ amount, method, phone: savedNumber ? undefined : depPhone }),
      });
      if (r.checkoutUrl) {
        window.location.href = r.checkoutUrl;
        return;
      }
      if (r.reference) {
        setWaitRef(r.reference);
        setWaitAmount(amount);
        setStep("waiting");
        return;
      }
      setErr("AlphaPay did not start this deposit — try again.");
      setStep("form");
    } catch (ex) {
      if (ex instanceof ApiError && ex.code === "payment_blocked" && ex.blockedUntil) {
        setBlockedUntil(ex.blockedUntil);
      } else {
        setErr(ex instanceof Error ? ex.message : "AlphaPay deposit failed");
      }
      setStep("form");
    } finally {
      setBusy(false);
    }
  };

  // PayTeller / Flutterwave: the create call returns a checkout URL
  // and the browser leaves for it. AlphaPay: the create returns a
  // reference and the modal waits for the phone prompt instead.
  const confirmGateway = async () => {
    if (alphapayActive) {
      void confirmAlphapay();
      return;
    }
    setBusy(true);
    try {
      // Nov 2026 Flutterwave v3 (Nigeria only): no MoMo number, no
      // method — the checkout page collects everything.
      if (flutterwaveActive) {
        const r = await api<{ checkoutUrl: string; reference: string }>("/api/wallet/flutterwave/create", {
          method: "POST",
          body: JSON.stringify({ amount }),
        });
        window.location.href = r.checkoutUrl;
        return;
      }
      // Deposit MoMo number (Nov 2026): the saved number when one is
      // set, otherwise the number typed on this first deposit — the
      // server saves it. A typed number is ignored server-side once
      // one is saved, so a forged body phone can never move the push.
      const r = await api<{ checkoutUrl: string; reference: string }>("/api/wallet/payteller/create", {
        method: "POST",
        body: JSON.stringify({ amount, method, phone: numberToUse || undefined }),
      });
      window.location.href = r.checkoutUrl;
      return;
    } catch (ex) {
      if (ex instanceof ApiError && ex.code === "payment_blocked" && ex.blockedUntil) {
        setBlockedUntil(ex.blockedUntil);
      } else {
        setErr(ex instanceof Error ? ex.message : "Deposit failed");
      }
      setStep("form");
      setBusy(false);
    }
  };

  return (
    <div className="rg48-scrim" role="dialog" aria-modal="true" aria-label="Deposit">
      <div className="rg48-cardwrap">
        <div className="rg48-card">
          <button className="icon-btn rg48-x" type="button" aria-label="Close" onClick={() => setDepositOpen(false)}>✕</button>
          {blockedUntil ? (
            <>
              <h3>Payments <em>paused</em></h3>
              <p className="sub">Too many failed payments. Your account and number are paused for 24 hours.</p>
              <div className="rg48-bigtime"><span>You can pay again on</span><b>{formatBlockedUntil(blockedUntil)}</b></div>
              <p className="sub" style={{ textAlign: "center", marginBottom: 16 }}>If you think this is a mistake, contact support.</p>
              <button className="btn btn-gold" type="button" style={{ width: "100%" }} onClick={() => setDepositOpen(false)}>Got it</button>
            </>
          ) : askOpen ? (
            <>
              <h3>{alphapayActive ? "Check your phone" : "Go to checkout?"}</h3>
              <p className="sub" style={{ textAlign: "center" }}>
                {alphapayActive ? (
                  <>AlphaPay will push a prompt to your phone for <b>{fmtMoney(amount, fiat)}</b> — approve it with your MoMo PIN there.</>
                ) : (
                  <>Pay <b>{fmtMoney(confirmTotal, fiat)}</b> on {flutterwaveActive ? "Flutterwave" : "PayTeller"}&apos;s checkout page — you confirm and pay there.</>
                )}
              </p>
              <div className="rg48-btnrow">
                <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setStep("confirm")}>No</button>
                <button className="btn btn-gold" type="button" disabled={busy} onClick={() => void confirmGateway()}>{busy ? (alphapayActive ? "Sending prompt…" : "Redirecting…") : "Yes"}</button>
              </div>
            </>
          ) : step === "waiting" ? (
            <>
              <h3>Prompt <em>sent</em></h3>
              <p className="sub" style={{ textAlign: "center" }}>
                Check your phone for the MoMo prompt{waitAmount != null ? <> for <b>{fmtMoney(waitAmount, fiat)}</b></> : null} and approve it with your MoMo PIN. Your wallet updates the moment it goes through.
              </p>
              <div className="rg48-spin" role="status" aria-label="Waiting for the MoMo prompt" />
              <p className="sub" style={{ textAlign: "center" }}>Don&apos;t close this — it checks every few seconds.</p>
              <div className="rg48-btnrow">
                <button className="btn btn-ghost" type="button" onClick={() => { setWaitRef(""); setStep("form"); }}>Cancel</button>
              </div>
            </>
          ) : step === "confirm" && gatewayActive ? (
            <>
              <h3>Confirm your <em>deposit</em></h3>
              <p className="sub">{alphapayActive ? "Check this before the prompt is sent to your phone." : "Check this before you go to the checkout page."}</p>
              <div className="rg48-bignum"><b>{fmtMoney(confirmTotal, fiat)}</b><span>{fmtMoney(amount, fiat)} will be added to your wallet</span></div>
              <div className="rg48-rows">
                <div><span>Deposit</span><strong>{fmtMoney(amount, fiat)}</strong></div>
                {flutterwaveActive ? (
                  <>
                    <div><span>Flutterwave fee</span><strong>{fmtMoney(flutterwaveFee, fiat)}</strong></div>
                    <div className="rg48-total"><span>Total you pay</span><strong>{fmtMoney(confirmTotal, fiat)}</strong></div>
                    <div><span>Method</span><strong>Card / bank transfer / USSD — you choose on the checkout page</strong></div>
                  </>
                ) : alphapayActive ? (
                  <>
                    <div><span>AlphaPay fee</span><strong>{fmtMoney(alphapayFee, fiat)}</strong></div>
                    <div className="rg48-total"><span>Total you pay</span><strong>{fmtMoney(confirmTotal, fiat)}</strong></div>
                    <div><span>Network</span><strong>{NETWORK_LABEL[method] ?? method}</strong></div>
                    <div><span>Number</span><strong>{numberToUse || "—"}</strong></div>
                  </>
                ) : (
                  <>
                    <div><span>MoMo fee (2%)</span><strong>{fmtMoney(paytellerFee, fiat)}</strong></div>
                    <div className="rg48-total"><span>Total from your MoMo</span><strong>{fmtMoney(confirmTotal, fiat)}</strong></div>
                    <div><span>Network</span><strong>{NETWORK_LABEL[method] ?? method}</strong></div>
                    <div><span>Number</span><strong>{numberToUse || "You'll enter it on the checkout page"}</strong></div>
                  </>
                )}
              </div>
              {flutterwaveActive ? (
                <p className="rg48-warn">You pay exactly <b>{fmtMoney(confirmTotal, fiat)}</b> — Flutterwave&apos;s fee is on us.</p>
              ) : alphapayActive ? (
                <p className="rg48-warn">You pay exactly <b>{fmtMoney(confirmTotal, fiat)}</b> — AlphaPay&apos;s fee is on us.</p>
              ) : (
                <p className="rg48-warn">Make sure you have at least <b>{fmtMoney(confirmTotal, fiat)}</b> in your {NETWORK_LABEL[method] ?? method} wallet. If your balance is lower, the payment will fail.</p>
              )}
              <div className="rg48-btnrow">
                <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setStep("form")}>Cancel</button>
                <button className="btn btn-gold" type="button" disabled={busy} onClick={() => setStep("ask")}>Deposit</button>
              </div>
            </>
          ) : (
            <>
              <h3>Top <em>up</em></h3>
              {refPct != null && (<p className="sub">Your referring admin earns {refPct}% commission on this deposit.</p>)}
              <form onSubmit={submit}>
            <div className="rg48-f"><label htmlFor="depAmt">Amount ({sym})</label><input id="depAmt" type="number" min={1} step={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} required disabled={fixedDeposit !== null} /></div>
            {fixedDeposit !== null ? (
              <p className="rg48-mini" style={{ marginTop: -4, marginBottom: 12 }}>Fixed deposit {fmtMoney(fixedDeposit, fiat)} — every deposit is this amount.</p>
            ) : minDeposit != null ? (
              <p className="rg48-mini" style={{ marginTop: -4, marginBottom: 12 }}>Minimum deposit {fmtMoney(minDeposit, fiat)}.</p>
            ) : null}
            {flutterwaveActive ? (
              <p className="rg48-mini" style={{ marginTop: -4, marginBottom: 12 }}>Pay with card, bank transfer or USSD — you choose on Flutterwave&apos;s checkout page.</p>
            ) : (
              <div className="rg48-f"><label>Method</label>
                <div className="dep-methods">
                  {METHODS.map((m) => (
                    <button key={m} type="button" className={method === m ? "on" : ""} onClick={() => setMethod(m)} aria-pressed={method === m}>{m === "card" ? "Bank card" : m === "AirtelTigo" ? "AirtelTigo" : m}</button>
                  ))}
                </div>
              </div>
            )}
            {momoNumberActive && savedNumber === null && (
              <div className="rg48-f">
                <label htmlFor="depPhone">MoMo number (first deposit only)</label>
                <input id="depPhone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0244 000 000" value={depPhone} onChange={(e) => setDepPhone(e.target.value)} />
                <p className="sub">{alphapayActive ? "The prompt goes to this number. It is saved to your account — later deposits reuse it, and you change it only on your Account page." : "You'll confirm and pay on PayTeller's checkout page. It is saved to your account — later deposits reuse it, and you change it only on your Account page."}</p>
              </div>
            )}
            {momoNumberActive && savedNumber !== null && (
              <p className="rg48-mini" style={{ marginTop: -4, marginBottom: 12 }}>Deposit number: <b>{savedNumber}</b> — change it on your Account page.</p>
            )}
            {gatewayActive && !user?.email && (
              <div className="rg48-f">
                <label htmlFor="depEmail">Email for your {gatewayName} receipt</label>
                <input id="depEmail" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} />
                <p className="sub">{gatewayName} sends your receipt here. Your phone number stays on your account.</p>
                <button className="btn btn-gold" type="button" style={{ width: "100%" }} disabled={emailBusy} onClick={() => void saveEmail()}>{emailBusy ? "Saving…" : "Save email"}</button>
                {emailMsg && <p className="rg48-err">{emailMsg}</p>}
              </div>
            )}
            <p className="rg48-err">{err}</p>
            <button className="btn btn-gold" type="submit" style={{ width: "100%" }} disabled={busy}>
              {busy
                ? "Depositing…"
                : (gatewayActive ? `Continue — ${fmtMoney(confirmTotal, fiat)}` : `Deposit ${fmtMoney(amount, fiat)}`)}
            </button>
          </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
