// Auth modal — v48 register/login card (rg48-* classes from the export).
// Register accepts ?ref=CODE prefill; demo owner login shown on screen.

"use client";

import { useEffect, useState } from "react";
import { useStore } from "../lib/store";
import { COUNTRIES } from "../lib/country";

export default function AuthModal() {
  const { authOpen, authMode, closeAuth, openAuth, login, loginTotp, register, toast, refPrefill } = useStore();
  const [tab, setTab] = useState<"login" | "register">(authMode);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [pass, setPass] = useState("");
  const [ref, setRef] = useState("");
  // Phase 1 country-based (Nov 2026): the country the account plays
  // in. The fiat is derived from it (GH → GHS, NG → NGN) and can
  // never be changed after register — the picker says so.
  const [country, setCountry] = useState("GH");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  // P0 Batch 3 (A13): the login's second step — set when the password
  // step returns totpRequired, cleared on close / tab switch.
  const [totpUserId, setTotpUserId] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");

  useEffect(() => {
    setTab(authMode);
    if (authMode === "register" && refPrefill) setRef(refPrefill);
  }, [authMode, authOpen, refPrefill]);

  // Escape closes the modal (round 6 check: it did not, and the open
  // scrim then blocked the header button behind it).
  useEffect(() => {
    if (!authOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeAuth(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [authOpen, closeAuth]);

  if (!authOpen) return null;

  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = await login(contact.trim(), pass);
      if ("totpRequired" in r) {
        setTotpUserId(r.userId);
        setTotpCode("");
        return;
      }
      toast(`Welcome back, ${r.user.name.split(" ")[0]}`, "win");
      closeAuth();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  const doTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpUserId) return;
    setErr("");
    setBusy(true);
    try {
      const u = await loginTotp(totpUserId, totpCode.trim());
      toast(`Welcome back, ${u.name.split(" ")[0]}`, "win");
      setTotpUserId(null);
      setTotpCode("");
      closeAuth();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Invalid code");
    } finally {
      setBusy(false);
    }
  };

  const doRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = await register(name.trim(), contact.trim(), pass, ref.trim() || undefined, country);
      toast(
        r.referredBonusCoins ? `Account created — 10 free coins + ${r.referredBonusCoins} referral coins` : "Account created — 10 free coins",
        "win"
      );
      closeAuth();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rg48-scrim" role="dialog" aria-modal="true" aria-label="Log in or register">
      <div className="rg48-cardwrap">
        <div className="rg48-card">
          <button className="icon-btn rg48-x" type="button" aria-label="Close" onClick={closeAuth}>✕</button>
          <h3>{tab === "login" ? <>Welcome <em>back</em></> : <>Create your <em>account</em></>}</h3>
          <p className="sub">Log in to play coin games, track your referrals and claim your daily coins.</p>
          <div className="rg48-tabs" role="group" aria-label="Login or register">
            <button type="button" aria-pressed={tab === "login"} onClick={() => { setTab("login"); setErr(""); }}>Log in</button>
            <button type="button" aria-pressed={tab === "register"} onClick={() => { setTab("register"); setErr(""); }}>Register</button>
          </div>
          {tab === "login" ? (
            totpUserId ? (
              <form onSubmit={doTotp} autoComplete="off">
                <p className="sub">Two-factor auth is on for this account — enter the 6-digit code from your authenticator app.</p>
                <div className="rg48-f"><label htmlFor="liTotp">Authenticator code</label><input id="liTotp" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6-digit code" value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))} required /></div>
                <p className="rg48-err">{err}</p>
                <button className="btn btn-gold" type="submit" style={{ width: "100%" }} disabled={busy || totpCode.length !== 6}>{busy ? "Verifying…" : "Verify & log in"}</button>
                <p className="rg48-mini" style={{ marginTop: 10 }}><button type="button" className="linklike" onClick={() => { setTotpUserId(null); setTotpCode(""); setErr(""); }}>← Back to password</button></p>
              </form>
            ) : (
              <form onSubmit={doLogin} autoComplete="off">
                <div className="rg48-f"><label htmlFor="liContact">Email or phone</label><input id="liContact" type="text" placeholder="you@example.com or 0244 000 000" value={contact} onChange={(e) => setContact(e.target.value)} required /></div>
                <div className="rg48-f"><label htmlFor="liPass">Password</label><input id="liPass" type="password" placeholder="Your password" value={pass} onChange={(e) => setPass(e.target.value)} required /></div>
                <p className="rg48-err">{err}</p>
                <button className="btn btn-gold" type="submit" style={{ width: "100%" }} disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
              </form>
            )
          ) : (
            <form onSubmit={doRegister} autoComplete="off">
              <div className="rg48-f"><label htmlFor="rgName">Full name</label><input id="rgName" type="text" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required /></div>
              <div className="rg48-f"><label htmlFor="rgContact">Email or phone</label><input id="rgContact" type="text" placeholder="you@example.com or 0244 000 000" value={contact} onChange={(e) => setContact(e.target.value)} required /></div>
              <div className="rg48-f"><label htmlFor="rgPass">Password</label><input id="rgPass" type="password" placeholder="Pick a password" value={pass} onChange={(e) => setPass(e.target.value)} required minLength={6} /></div>
              <div className="rg48-f">
                <label htmlFor="rgCountry">Country</label>
                <select id="rgCountry" value={country} onChange={(e) => setCountry(e.target.value)} required>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.name} ({c.currency})</option>
                  ))}
                </select>
              </div>
              <p className="rg48-mini" style={{ marginTop: -4, marginBottom: 12 }}>Your country sets your currency — {country === "NG" ? "Nigerian naira (₦)" : "Ghana cedi (GH₵)"} — and can&apos;t be changed later.</p>
              <div className="rg48-f"><label htmlFor="rgRef">Referral code (optional) — worth 5 free coins</label><input id="rgRef" type="text" placeholder="e.g. RG-DEMO1" value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} /></div>
              <p className="rg48-err">{err}</p>
              <button className="btn btn-gold" type="submit" style={{ width: "100%" }} disabled={busy}>{busy ? "Creating…" : "Create account · get 10 free coins"}</button>
              <p className="rg48-mini" style={{ marginTop: 10 }}>Coins are play-only: spin them in coin games and win more — they can never be withdrawn or swapped for cash.</p>
            </form>
          )}
          <p className="rg48-mini" style={{ marginTop: 12 }}>
            {tab === "login" ? <>No account yet? <button type="button" className="linklike" onClick={() => openAuth("register")}>Register</button></> : <>Already have an account? <button type="button" className="linklike" onClick={() => openAuth("login")}>Log in</button></>}
          </p>
        </div>
      </div>
    </div>
  );
}
