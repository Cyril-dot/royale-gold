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
import { api, fmtMoney, Wallet, User } from "../lib/api";
import { symbolFor } from "../lib/country";
import { useStore } from "../lib/store";

const METHODS = ["MTN", "Telecel", "AirtelTigo", "card"] as const;
const MOMO_METHODS = ["MTN", "Telecel", "AirtelTigo"] as const;

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
  // Phase 2 PayTeller (Nov 2026): the live Ghana gateway, read from the
  // public config when the modal opens. null = not loaded yet (treated
  // as demo until it arrives, so the button never flickers gateways).
  const [gateway, setGateway] = useState<string | null>(null);
  // Country-based min-deposit hint (Nov 2026): the player's fiat
  // minimum from the same config call (GHS 1, NGN 100 seed) — a hint
  // only, the server still enforces it.
  const [minDeposit, setMinDeposit] = useState<number | null>(null);
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
    api<{ ghMomoGateway?: string; currencies?: { currency: string; minDeposit: number }[] }>("/api/games/config")
      .then((r) => {
        if (!live) return;
        setGateway(r.ghMomoGateway ?? "demo");
        const row = r.currencies?.find((c) => c.currency === fiat);
        if (row && row.minDeposit > 0) setMinDeposit(row.minDeposit);
      })
      .catch(() => { if (live) setGateway("demo"); });
    return () => { live = false; };
  }, [depositOpen, fiat]);

  // Escape closes the modal (same fix as AuthModal, round 6).
  useEffect(() => {
    if (!depositOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDepositOpen(false); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [depositOpen, setDepositOpen]);

  if (!depositOpen) return null;

  const paytellerActive =
    fiat === "GHS" && gateway === "payteller" && (MOMO_METHODS as readonly string[]).includes(method);
  // What the customer authorizes on PayTeller: principal + the 2%
  // Theteller MoMo fee (docs §05). The wallet is credited the full
  // principal once PayTeller confirms — the fee is on top, not out of it.
  const paytellerTotal = Math.round(amount * 1.02 * 100) / 100;

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
      setBusy(true);
      try {
        const r = await api<{ checkoutUrl: string; reference: string }>("/api/wallet/payteller/create", {
          method: "POST",
          body: JSON.stringify({ amount, method }),
        });
        window.location.href = r.checkoutUrl;
      } catch (ex) {
        setErr(ex instanceof Error ? ex.message : "PayTeller deposit failed");
        setBusy(false);
      }
      return;
    }
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
      setErr(ex instanceof Error ? ex.message : "Deposit failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rg48-scrim" role="dialog" aria-modal="true" aria-label="Deposit">
      <div className="rg48-cardwrap">
        <div className="rg48-card">
          <button className="icon-btn rg48-x" type="button" aria-label="Close" onClick={() => setDepositOpen(false)}>✕</button>
          <h3>Top <em>up</em></h3>
          <p className="sub">Cash deposits only.{refPct != null ? ` Your referring admin earns ${refPct}% commission on this deposit.` : ""}</p>
          <form onSubmit={submit}>
            <div className="rg48-f"><label htmlFor="depAmt">Amount ({sym})</label><input id="depAmt" type="number" min={1} step={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} required /></div>
            {minDeposit != null && (
              <p className="rg48-mini" style={{ marginTop: -4, marginBottom: 12 }}>Minimum deposit {fmtMoney(minDeposit, fiat)}.</p>
            )}
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
            {paytellerActive && user?.email && (
              <p className="sub">You pay on PayTeller&apos;s secure checkout — {fmtMoney(paytellerTotal, fiat)} in total (includes the 2% MoMo fee). Your wallet is credited the full {fmtMoney(amount, fiat)} once PayTeller confirms it.</p>
            )}
            <p className="rg48-err">{err}</p>
            <button className="btn btn-gold" type="submit" style={{ width: "100%" }} disabled={busy}>
              {busy
                ? (paytellerActive ? "Redirecting to PayTeller…" : "Depositing…")
                : (paytellerActive ? `Pay ${fmtMoney(paytellerTotal, fiat)} with PayTeller` : `Deposit ${fmtMoney(amount, fiat)}`)}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
