// Settings page — profile (name, email/phone), password change, preferences
// (sound, default mode) and a read-only account summary. Every save goes
// through a real API: PATCH /api/auth/me and POST /api/auth/change-password.
// Sound + default mode are per-device preferences (localStorage, via store).

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, fmtMoney, fmtCoins } from "../../lib/api";
import { symbolFor } from "../../lib/country";
import { useStore } from "../../lib/store";

// P0 Batch 3 (A13) — TOTP two-factor auth, opt-in per admin/owner.
// Step 1: "Set up" generates a secret + QR code (still disabled).
// Step 2: the code from the authenticator app turns it on. Turning it
// off needs a valid current code. The secret is shown once, at setup.
function TwoFactorSection() {
  const { user, toast, refresh } = useStore();
  const [setup, setSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  if (!user || (user.role !== "admin" && user.role !== "owner")) return null;

  const startSetup = async () => {
    setBusy(true);
    try {
      const res = await api<{ secret: string; qrDataUrl: string }>("/api/auth/2fa/setup", { method: "POST" });
      setSetup(res);
      setCode("");
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not start setup", "lose");
    } finally { setBusy(false); }
  };
  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/auth/2fa/verify", { method: "POST", body: JSON.stringify({ code: code.trim() }) });
      toast("Two-factor auth is ON — your next login will ask for a code", "win");
      setSetup(null);
      setCode("");
      await refresh();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Invalid code", "lose");
    } finally { setBusy(false); }
  };
  const disable = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/auth/2fa/disable", { method: "POST", body: JSON.stringify({ code: code.trim() }) });
      toast("Two-factor auth is OFF", "win");
      setCode("");
      await refresh();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Invalid code", "lose");
    } finally { setBusy(false); }
  };

  return (
    <section className="admin-sec">
      <h3>Two-factor auth</h3>
      {user.totpEnabled ? (
        <>
          <p>Two-factor auth is <b>ON</b> — logging in asks for a code from your authenticator app after your password.</p>
          <form onSubmit={disable}>
            <div className="rg48-f"><label htmlFor="st2faOff">Code from your authenticator app</label><input id="st2faOff" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="6-digit code" required /></div>
            <button className="btn btn-ghost" type="submit" disabled={busy || code.length !== 6}>{busy ? "Turning off…" : "Turn off two-factor auth"}</button>
          </form>
        </>
      ) : setup ? (
        <>
          <p>Scan this QR code with your authenticator app (Google Authenticator, Authy, or any TOTP app), then enter the 6-digit code to turn it on.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="tfa-qr" src={setup.qrDataUrl} alt="Two-factor auth QR code" width={200} height={200} />
          <p className="rg48-mini">Or enter this secret by hand: <code>{setup.secret}</code></p>
          <form onSubmit={verify}>
            <div className="rg48-f"><label htmlFor="st2faOn">Code from your authenticator app</label><input id="st2faOn" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="6-digit code" required /></div>
            <button className="btn btn-gold" type="submit" disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Verify & turn on"}</button>
            <button className="btn btn-ghost" type="button" onClick={() => { setSetup(null); setCode(""); }}>Cancel</button>
          </form>
        </>
      ) : (
        <>
          <p>Optional. When on, logging in asks for a 6-digit code from your authenticator app after your password.</p>
          <button className="btn btn-gold" type="button" onClick={() => void startSetup()} disabled={busy}>{busy ? "Starting…" : "Set up two-factor auth"}</button>
        </>
      )}
    </section>
  );
}

export default function SettingsPage() {
  const { user, wallet, mode, setMode, muted, toggleMute, openAuth, toast, refresh } = useStore();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [curPass, setCurPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [passBusy, setPassBusy] = useState(false);
  const [economy, setEconomy] = useState<{ lifetimeDeposited: number; liveFactor: number; decayStep?: number } | null>(null);

  // Seed the form from the signed-in user whenever it changes.
  useEffect(() => {
    if (user) {
      setName(user.name);
      setContact(user.email ?? user.phone ?? "");
      api<{ lifetimeDeposited: number; liveFactor: number; decayStep?: number }>("/api/games/economy")
        .then(setEconomy)
        .catch(() => setEconomy(null));
    }
  }, [user]);

  if (!user) {
    return (
      <main className="rg48-page-main rg23"><div className="wrap">
        <h2><em>Settings</em></h2>
        <p>Log in to change your settings.</p>
        <button className="btn btn-gold" type="button" onClick={() => openAuth("login")}>Log in</button>
      </div></main>
    );
  }

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileBusy(true);
    try {
      await api("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim(), emailOrPhone: contact.trim() }),
      });
      toast("Profile saved", "win");
      await refresh();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Save failed", "lose");
    } finally { setProfileBusy(false); }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPass !== confirmPass) {
      toast("New passwords do not match", "lose");
      return;
    }
    setPassBusy(true);
    try {
      await api("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: curPass, newPassword: newPass }),
      });
      toast("Password changed", "win");
      setCurPass("");
      setNewPass("");
      setConfirmPass("");
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Password change failed", "lose");
    } finally { setPassBusy(false); }
  };

  const cash = wallet?.cash ?? user.cash;
  const coins = wallet?.coins ?? user.coins;
  const sim = wallet?.sim ?? user.sim;

  return (
    <main className="rg48-page-main rg23">
      <div className="wrap">
        <div className="rg48-hbar-in">
          <Link className="gp-back" href="/account" aria-label="Back to account"><span className="gp-back-coin">←</span></Link>
        </div>
        <h2>Your <em>settings</em></h2>

        <section className="admin-sec">
          <h3>Profile</h3>
          <form onSubmit={saveProfile}>
            <div className="rg48-f"><label htmlFor="stName">Full name</label><input id="stName" type="text" value={name} onChange={(e) => setName(e.target.value)} required /></div>
            <div className="rg48-f"><label htmlFor="stContact">Email or phone</label><input id="stContact" type="text" value={contact} onChange={(e) => setContact(e.target.value)} required /></div>
            <p className="rg48-mini">One contact only. Changing it changes how you log in.</p>
            <button className="btn btn-gold" type="submit" disabled={profileBusy}>{profileBusy ? "Saving…" : "Save profile"}</button>
          </form>
        </section>

        <section className="admin-sec">
          <h3>Change password</h3>
          <form onSubmit={changePassword}>
            <div className="rg48-f"><label htmlFor="stCurPass">Current password</label><input id="stCurPass" type="password" value={curPass} onChange={(e) => setCurPass(e.target.value)} required autoComplete="current-password" /></div>
            <div className="rg48-f"><label htmlFor="stNewPass">New password</label><input id="stNewPass" type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} required minLength={6} autoComplete="new-password" /></div>
            <div className="rg48-f"><label htmlFor="stConfirmPass">Confirm new password</label><input id="stConfirmPass" type="password" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} required minLength={6} autoComplete="new-password" /></div>
            <button className="btn btn-gold" type="submit" disabled={passBusy}>{passBusy ? "Changing…" : "Change password"}</button>
          </form>
        </section>

        <TwoFactorSection />

        <section className="admin-sec">
          <h3>Preferences</h3>
          <p className="rg48-mini">Saved on this device only.</p>
          <div className="rg48-f"><label>Sound</label>
            <button className="btn btn-ghost" type="button" onClick={toggleMute} aria-pressed={!muted}>
              {muted ? "Sound: off — tap to turn on" : "Sound: on — tap to mute"}
            </button>
          </div>
          <div className="rg48-f"><label>Default mode</label>
            <div className="mode-row">
              <button className={`btn ${mode === "REAL" ? "btn-gold" : "btn-ghost"}`} type="button" onClick={() => setMode("REAL")} aria-pressed={mode === "REAL"}>REAL</button>
              <button className={`btn ${mode === "SIM" ? "btn-gold" : "btn-ghost"}`} type="button" onClick={() => setMode("SIM")} aria-pressed={mode === "SIM"}>SIM</button>
            </div>
            <p className="rg48-mini">SIM is play-money mode. REAL uses your cash balance.</p>
          </div>
        </section>

        <section className="admin-sec">
          <h3>How winning works</h3>
          <p>SIM is play-money mode — winning comes easier so you can test the games.</p>
          <p>LIVE win chance falls 5% for every {fmtMoney(economy?.decayStep ?? 100, user.currency ?? "GHS")} you have deposited, never below half the normal rate.</p>
          {economy && (
            <p>Your total deposits: <b>{fmtMoney(economy.lifetimeDeposited, user.currency ?? "GHS")}</b> — your LIVE win chance right now is <b>{Math.round(economy.liveFactor * 100)}%</b> of normal.</p>
          )}
          <p className="rg48-mini">Crash games are provably fair and never adjusted. Coin games are not affected.</p>
        </section>

        <section className="admin-sec">
          <h3>Your account</h3>
          <div className="sum-cards">
            <div className="sum-card"><span>CASH</span><b>{fmtMoney(cash, user.currency ?? "GHS")}</b></div>
            <div className="sum-card"><span>COINS</span><b>{fmtCoins(coins)}</b></div>
            <div className="sum-card"><span>SIM</span><b>{fmtCoins(sim)}</b></div>
            <div className="sum-card"><span>LEVEL</span><b>{user.level} · {user.xp} XP</b></div>
          </div>
          <p>Role: <b>{user.role}</b></p>
          <p>Country: <b>{user.country === "NG" ? "Nigeria" : "Ghana"}</b> · Currency: <b>{user.currency ?? "GHS"} ({symbolFor(user.currency)})</b></p>
          <p>Joined: <b>{new Date(user.createdAt).toLocaleDateString("en-GB")}</b></p>
          <p>Referral code used: <b>{user.referralCodeUsed ?? "—"}</b></p>
          <p className="rg48-mini">Your country and currency were set when you registered and can&apos;t be changed here.</p>
          <p><Link className="linklike" href="/account">Back to my account →</Link></p>
        </section>
      </div>
    </main>
  );
}
