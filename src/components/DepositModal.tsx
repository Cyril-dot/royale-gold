// Demo cashier — POST /api/wallet/deposit (cash only, coins never involved).

"use client";

import { useEffect, useState } from "react";
import { api, fmtMoney, Wallet } from "../lib/api";
import { symbolFor } from "../lib/country";
import { useStore } from "../lib/store";

const METHODS = ["MTN", "Telecel", "AirtelTigo", "card"] as const;

export default function DepositModal() {
  const { depositOpen, setDepositOpen, setWallet, toast, user } = useStore();
  // Phase 1 country-based (Nov 2026): the modal shows the player's own
  // fiat symbol, and only that fiat's methods apply (the server
  // enforces it — the method list is the same for both fiats in demo).
  const fiat = user?.currency ?? "GHS";
  const sym = symbolFor(fiat);
  const [amount, setAmount] = useState(100);
  const [method, setMethod] = useState<(typeof METHODS)[number]>("MTN");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
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

  // Escape closes the modal (same fix as AuthModal, round 6).
  useEffect(() => {
    if (!depositOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDepositOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [depositOpen, setDepositOpen]);

  if (!depositOpen) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
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
            <div className="rg48-f"><label>Method</label>
              <div className="dep-methods">
                {METHODS.map((m) => (
                  <button key={m} type="button" className={method === m ? "on" : ""} onClick={() => setMethod(m)} aria-pressed={method === m}>{m === "card" ? "Bank card" : m === "AirtelTigo" ? "AirtelTigo" : m}</button>
                ))}
              </div>
            </div>
            <p className="rg48-err">{err}</p>
            <button className="btn btn-gold" type="submit" style={{ width: "100%" }} disabled={busy}>{busy ? "Depositing…" : `Deposit ${fmtMoney(amount, fiat)}`}</button>
          </form>
        </div>
      </div>
    </div>
  );
}
