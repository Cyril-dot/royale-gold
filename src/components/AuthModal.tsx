// Auth modal — v48 register/login card (rg48-* classes from the export).
// Register accepts ?ref=CODE prefill; demo owner login shown on screen.

"use client";

import { useEffect, useState } from "react";
import { useStore } from "../lib/store";
import { api } from "../lib/api";
import { COUNTRIES, phonePlaceholder } from "../lib/country";

// Show/hide eye for the password fields — inline SVG, no dependency.
// onMouseDown prevents the tap from stealing focus out of the field.
function PassEye({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="rg48-eye"
      aria-label={shown ? "Hide password" : "Show password"}
      aria-pressed={shown}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onToggle}
    >
      {shown ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
      )}
    </button>
  );
}

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
  // Email OTP (Nov 2026): step 1 proves the email is real (send code
  // → enter it → verify); step 2 (name, password, …) unlocks only
  // after that. The verify token is spent by the register call.
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [verifyToken, setVerifyToken] = useState("");
  const [otpErr, setOtpErr] = useState("");
  const [otpInfo, setOtpInfo] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

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

// Password eye (Nov 2026): show/hide on both password fields so a
  // mistyped password can be seen before it is stored or sent.
  const [showLoginPass, setShowLoginPass] = useState(false);
  const [showRegPass, setShowRegPass] = useState(false);

  // Resend countdown — ticks down once a second while it runs.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const resetOtp = () => {
    setOtpSent(false);
    setOtpVerified(false);
    setVerifyToken("");
    setOtpCode("");
    setOtpErr("");
    setOtpInfo("");
    setResendIn(0);
  };

  const doSendOtp = async () => {
    const email = otpEmail.trim().toLowerCase();
    if (!email.includes("@")) { setOtpErr("Enter a valid email address"); return; }
    setOtpErr("");
    setOtpInfo("");
    setOtpBusy(true);
    try {
      await api("/api/auth/email-otp/send", { method: "POST", body: JSON.stringify({ email }) });
      setOtpSent(true);
      setOtpCode("");
      setOtpInfo("Code sent — check your inbox (and spam). It expires in 10 minutes.");
      setResendIn(60);
    } catch (ex) {
      setOtpErr(ex instanceof Error ? ex.message : "Could not send the code");
    } finally {
      setOtpBusy(false);
    }
  };

  const doVerifyOtp = async () => {
    if (otpCode.length !== 6) { setOtpErr("Enter the 6-digit code"); return; }
    setOtpErr("");
    setOtpBusy(true);
    try {
      const r = await api<{ verifyToken: string }>("/api/auth/email-otp/verify", {
        method: "POST",
        body: JSON.stringify({ email: otpEmail.trim().toLowerCase(), code: otpCode.trim() }),
      });
      setVerifyToken(r.verifyToken);
      setOtpVerified(true);
      setOtpInfo("");
    } catch (ex) {
      setOtpErr(ex instanceof Error ? ex.message : "Verification failed");
    } finally {
      setOtpBusy(false);
    }
  };

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
      // Email OTP: the verified email IS the account email — the
      // register call carries the one-time token from the verify step.
      const r = await register(name.trim(), otpEmail.trim().toLowerCase(), pass, ref.trim() || undefined, country, verifyToken);
      toast(
        r.referredBonusCoins ? `Account created — 5 free coins + ${r.referredBonusCoins} referral coins` : "Account created — 5 free coins",
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
          <div className="rg48-tabs" role="group" aria-label="Login or register">
            <button type="button" aria-pressed={tab === "login"} onClick={() => { setTab("login"); setErr(""); resetOtp(); }}>Log in</button>
            <button type="button" aria-pressed={tab === "register"} onClick={() => { setTab("register"); setErr(""); resetOtp(); }}>Register</button>
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
                <div className="rg48-f"><label htmlFor="liContact">Email or phone</label><input id="liContact" type="text" placeholder={phonePlaceholder("GH")} value={contact} onChange={(e) => setContact(e.target.value)} required autoCapitalize="off" autoCorrect="off" spellCheck={false} inputMode="email" /></div>
                <div className="rg48-f"><label htmlFor="liPass">Password</label><div className="rg48-passwrap"><input id="liPass" type={showLoginPass ? "text" : "password"} placeholder="Your password" value={pass} onChange={(e) => setPass(e.target.value)} required autoCapitalize="off" autoCorrect="off" spellCheck={false} /><PassEye shown={showLoginPass} onToggle={() => setShowLoginPass((s) => !s)} /></div></div>
                <p className="rg48-err">{err}</p>
                <button className="btn btn-gold" type="submit" style={{ width: "100%" }} disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
              </form>
            )
          ) : (
            <form onSubmit={otpVerified ? doRegister : (e) => { e.preventDefault(); if (!otpSent) void doSendOtp(); else void doVerifyOtp(); }} autoComplete="off">
              {!otpVerified ? (
                <>
                  <div className="rg48-f"><label htmlFor="rgOtpEmail">Email — we&apos;ll send you a code to confirm it&apos;s real</label><input id="rgOtpEmail" type="email" placeholder="you@example.com" value={otpEmail} onChange={(e) => { setOtpEmail(e.target.value); setOtpErr(""); }} required autoCapitalize="off" autoCorrect="off" spellCheck={false} /></div>
                  {otpSent && (
                    <div className="rg48-f"><label htmlFor="rgOtpCode">6-digit code</label><input id="rgOtpCode" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))} required /></div>
                  )}
                  <p className="rg48-err">{otpErr}</p>
                  {otpInfo && <p className="rg48-mini" style={{ color: "#9ACD8A" }}>{otpInfo}</p>}
                  {!otpSent ? (
                    <button className="btn btn-gold" type="button" onClick={() => void doSendOtp()} style={{ width: "100%" }} disabled={otpBusy}>{otpBusy ? "Sending…" : "Send verification code"}</button>
                  ) : (
                    <>
                      <button className="btn btn-gold" type="button" onClick={() => void doVerifyOtp()} style={{ width: "100%" }} disabled={otpBusy || otpCode.length !== 6}>{otpBusy ? "Verifying…" : "Verify code"}</button>
                      <p className="rg48-mini" style={{ marginTop: 10 }}>
                        {resendIn > 0 ? (
                          <>Resend code in {resendIn}s</>
                        ) : (
                          <button type="button" className="linklike" onClick={() => void doSendOtp()} disabled={otpBusy}>Resend code</button>
                        )}
                        {" · "}<button type="button" className="linklike" onClick={() => { setOtpSent(false); setOtpCode(""); setOtpErr(""); setOtpInfo(""); }}>Change email</button>
                      </p>
                    </>
                  )}
                </>
              ) : (
                <>
                  <p className="rg48-mini" style={{ marginBottom: 10 }}>✓ Email verified: <b>{otpEmail.trim().toLowerCase()}</b> · <button type="button" className="linklike" onClick={resetOtp}>Change</button></p>
                  <div className="rg48-f"><label htmlFor="rgName">Full name</label><input id="rgName" type="text" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required /></div>
                  <div className="rg48-f"><label htmlFor="rgPass">Password</label><div className="rg48-passwrap"><input id="rgPass" type={showRegPass ? "text" : "password"} placeholder="Pick a password" value={pass} onChange={(e) => setPass(e.target.value)} required minLength={6} autoCapitalize="off" autoCorrect="off" spellCheck={false} /><PassEye shown={showRegPass} onToggle={() => setShowRegPass((s) => !s)} /></div></div>
                  <div className="rg48-f rg48-country">
                    <label id="rgCountryLabel">Country</label>
                    <div className="rg48-country-toggle" role="group" aria-labelledby="rgCountryLabel">
                      {COUNTRIES.map((c) => (
                        <button key={c.code} type="button" className="rg48-country-opt" aria-pressed={country === c.code} onClick={() => setCountry(c.code)}>
                          <span className="rg48-country-flag" aria-hidden="true">{c.flag}</span> {c.name} ({c.currency})
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rg48-f"><label htmlFor="rgRef">Referral code (optional) — worth 5 free coins</label><input id="rgRef" type="text" placeholder="e.g. RG-DEMO1" value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} /></div>
                  <p className="rg48-err">{err}</p>
                  <button className="btn btn-gold" type="submit" style={{ width: "100%" }} disabled={busy}>{busy ? "Creating…" : `Create account · get ${ref.trim() ? 10 : 5} free coins`}</button>
                </>
              )}
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
