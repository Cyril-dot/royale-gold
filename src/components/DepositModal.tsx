// Deposit modal — demo cashier (POST /api/wallet/deposit) by default.
// Phase 2 PayTeller (Nov 2026): when the player's fiat is GHS and the
// owner toggle has Ghana MoMo on PayTeller, the MTN / Telecel /
// AirtelTigo buttons start a PayTeller hosted checkout instead (POST
// /api/wallet/payteller/create → redirect to checkout_url). Card stays
// demo, and NGN users never see the PayTeller path.
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
  const { depositOpen, setDepositOpen, setWallet, setUser, toast, user } = useStore();
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
  // card with the real totals before anything is sent. The demo path
  // never enters it — play money, no real MoMo charge to confirm.
  const [step, setStep] = useState<"form" | "confirm">("form");
  // Phase 2 PayTeller (Nov 2026): the live Ghana gateway, read from the
  // public config when the modal opens. null = not loaded yet (treated
  // as demo until it arrives, so the button never flickers gateways).
  const [gateway, setGateway] = useState<string | null>(null);
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
    api<{ ghMomoGateway?: string; currencies?: { currency: string; minDeposit: number; fixedDepositAmount?: number | null }[] }>("/api/games/config")
      .then((r) => {
        if (!live) return;
        setGateway(r.ghMomoGateway ?? "demo");
        const row = r.currencies?.find((c) => c.currency === fiat);
        if (row && row.minDeposit > 0) setMinDeposit(row.minDeposit);
        // Fixed amount: lock the modal to it when set (null = OFF).
        // Fetched fresh every time the modal opens, so an owner change
        // mid-session shows up on the next open.
        const fixed = row?.fixedDepositAmount ?? null;
        setFixedDeposit(fixed !== null && fixed > 0 ? fixed : null);
        if (fixed !== null && fixed > 0) setAmount(fixed);
      })
      .catch(() => { if (live) setGateway("demo"); });
    // Payment blocks (Nov 2026): ask up front so a blocked user sees
    // the card immediately instead of filling the form and failing.
    // A missing-tables prod answers "not blocked" — never an error.
    api<{ blocked: boolean; blockedUntil?: string | null }>("/api/wallet/payment-block")
      .then((r) => { if (live) setBlockedUntil(r.blocked ? r.blockedUntil ?? null : null); })
      .catch(() => { if (live) setBlockedUntil(null); });
    return () => { live = false; };
  }, [depositOpen, fiat]);

  // Escape closes the modal (same fix as AuthModal, round 6).
  useEffect(() => {
    if (!depositOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDepositOpen(false); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [depositOpen, setDepositOpen]);

  // Fresh state on every open: the step and the block never carry
  // over from the last time the modal was shown. Adjusted during
  // render (the supported pattern — never in an effect, which the
  // linter flags as a cascading render).
  if (!depositOpen) {
    if (step !== "form" || blockedUntil !== null || err !== "") {
      setStep("form");
      setBlockedUntil(null);
      setErr("");
    }
    return null;
  }

  const paytellerActive =
    fiat === "GHS" && gateway === "payteller" && (MOMO_METHODS as readonly string[]).includes(method);
  // What the customer authorizes on PayTeller: principal + the 2%
  // Theteller MoMo fee (docs §05). The wallet is credited the full
  // principal once PayTeller confirms — the fee is on top, not out of it.
  const paytellerTotal = Math.round(amount * 1.02 * 100) / 100;
  // The 2% Theteller MoMo fee, on top of the principal — shown as its
  // own row on the confirm card so the total is never a surprise.
  const paytellerFee = Math.round((paytellerTotal - amount) * 100) / 100;

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
    if (paytellerActive) {
      if (!user?.email) {
        setErr("Add an email below first — PayTeller needs it for your receipt.");
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

  // PayTeller confirm step: only reached from the confirm card's
  // "Yes, go to checkout" — Cancel never calls this, so Cancel sends
  // nothing. A 403 with code "payment_blocked" swaps the card for
  // the blocked card; any other failure goes back to the form with
  // the plain error line.
  const confirmPayteller = async () => {
    setBusy(true);
    try {
      const r = await api<{ checkoutUrl: string; reference: string }>("/api/wallet/payteller/create", {
        method: "POST",
        body: JSON.stringify({ amount, method }),
      });
      window.location.href = r.checkoutUrl;
    } catch (ex) {
      if (ex instanceof ApiError && ex.code === "payment_blocked" && ex.blockedUntil) {
        setBlockedUntil(ex.blockedUntil);
      } else {
        setErr(ex instanceof Error ? ex.message : "PayTeller deposit failed");
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
          ) : step === "confirm" && paytellerActive ? (
            <>
              <h3>Confirm your <em>deposit</em></h3>
              <p className="sub">Check this before the checkout opens.</p>
              <div className="rg48-bignum"><b>{fmtMoney(paytellerTotal, fiat)}</b><span>{fmtMoney(amount, fiat)} will be added to your wallet</span></div>
              <div className="rg48-rows">
                <div><span>Deposit</span><strong>{fmtMoney(amount, fiat)}</strong></div>
                <div><span>MoMo fee (2%)</span><strong>{fmtMoney(paytellerFee, fiat)}</strong></div>
                <div className="rg48-total"><span>Total from your MoMo</span><strong>{fmtMoney(paytellerTotal, fiat)}</strong></div>
                <div><span>Network</span><strong>{NETWORK_LABEL[method] ?? method}</strong></div>
                <div><span>Number</span><strong>{user?.phone ?? "You'll enter it on the checkout page"}</strong></div>
              </div>
              <p className="rg48-warn">Make sure you have at least <b>{fmtMoney(paytellerTotal, fiat)}</b> in your {NETWORK_LABEL[method] ?? method} wallet. If your balance is lower, the payment will fail.</p>
              <div className="rg48-btnrow">
                <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setStep("form")}>Cancel</button>
                <button className="btn btn-gold" type="button" disabled={busy} onClick={() => void confirmPayteller()}>{busy ? "Opening checkout…" : "Checkout"}</button>
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
            <div className="rg48-f"><label>Method</label>
              <div className="dep-methods">
                {METHODS.map((m) => (
                  <button key={m} type="button" className={method === m ? "on" : ""} onClick={() => setMethod(m)} aria-pressed={method === m}>{m === "card" ? "Bank card" : m === "AirtelTigo" ? "AirtelTigo" : m}</button>
                ))}
              </div>
            </div>
            {paytellerActive && !user?.email && (
              <div className="rg48-f">
                <label htmlFor="depEmail">Email for your PayTeller receipt</label>
                <input id="depEmail" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} />
                <p className="sub">PayTeller sends your receipt here. Your phone number stays on your account.</p>
                <button className="btn btn-gold" type="button" style={{ width: "100%" }} disabled={emailBusy} onClick={() => void saveEmail()}>{emailBusy ? "Saving…" : "Save email"}</button>
                {emailMsg && <p className="rg48-err">{emailMsg}</p>}
              </div>
            )}
            <p className="rg48-err">{err}</p>
            <button className="btn btn-gold" type="submit" style={{ width: "100%" }} disabled={busy}>
              {busy
                ? "Depositing…"
                : (paytellerActive ? `Continue — ${fmtMoney(paytellerTotal, fiat)}` : `Deposit ${fmtMoney(amount, fiat)}`)}
            </button>
          </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
