// Auth modal — v48 register/login card (rg48-* classes from the export).
// Register accepts ?ref=CODE prefill; demo owner login shown on screen.

"use client";

import { useEffect, useState } from "react";
import { useStore } from "../lib/store";

export default function AuthModal() {
  const { authOpen, authMode, closeAuth, openAuth, login, register, toast, refPrefill } = useStore();
  const [tab, setTab] = useState<"login" | "register">(authMode);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [pass, setPass] = useState("");
  const [ref, setRef] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTab(authMode);
    if (authMode === "register" && refPrefill) setRef(refPrefill);
  }, [authMode, authOpen, refPrefill]);

  if (!authOpen) return null;

  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const u = await login(contact.trim(), pass);
      toast(`Welcome back, ${u.name.split(" ")[0]}`, "win");
      closeAuth();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  const doRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = await register(name.trim(), contact.trim(), pass, ref.trim() || undefined);
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
            <button type="button" aria-pressed={tab === "login"} onClick={() => setTab("login")}>Log in</button>
            <button type="button" aria-pressed={tab === "register"} onClick={() => setTab("register")}>Register</button>
          </div>
          {tab === "login" ? (
            <form onSubmit={doLogin} autoComplete="off">
              <div className="rg48-f"><label htmlFor="liContact">Email or phone</label><input id="liContact" type="text" placeholder="you@example.com or 0244 000 000" value={contact} onChange={(e) => setContact(e.target.value)} required /></div>
              <div className="rg48-f"><label htmlFor="liPass">Password</label><input id="liPass" type="password" placeholder="Your password" value={pass} onChange={(e) => setPass(e.target.value)} required /></div>
              <p className="rg48-err">{err}</p>
              <button className="btn btn-gold" type="submit" style={{ width: "100%" }} disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
              <div className="rg48-demo"><b>Demo accounts — remove before real launch.</b><br /><b>Demo owner login</b> — email <b>owner@royale.gold</b> · password <b>owner123</b>. The owner adds admins, sets their commission % and runs the referral system.<br /><b>Demo admin</b> — <b>admin@royale.gold</b> · <b>admin123</b> (10% commission, code RG-DEMO1).</div>
            </form>
          ) : (
            <form onSubmit={doRegister} autoComplete="off">
              <div className="rg48-f"><label htmlFor="rgName">Full name</label><input id="rgName" type="text" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required /></div>
              <div className="rg48-f"><label htmlFor="rgContact">Email or phone</label><input id="rgContact" type="text" placeholder="you@example.com or 0244 000 000" value={contact} onChange={(e) => setContact(e.target.value)} required /></div>
              <div className="rg48-f"><label htmlFor="rgPass">Password</label><input id="rgPass" type="password" placeholder="Pick a password" value={pass} onChange={(e) => setPass(e.target.value)} required minLength={6} /></div>
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
