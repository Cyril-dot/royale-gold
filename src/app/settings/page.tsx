// Settings page — profile (name, email/phone), password change, preferences
// (sound, default mode) and a read-only account summary. Every save goes
// through a real API: PATCH /api/auth/me and POST /api/auth/change-password.
// Sound + default mode are per-device preferences (localStorage, via store).

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, fmtCash, fmtCoins } from "../../lib/api";
import { useStore } from "../../lib/store";

export default function SettingsPage() {
  const { user, wallet, mode, setMode, muted, toggleMute, openAuth, toast, refresh } = useStore();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [curPass, setCurPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [passBusy, setPassBusy] = useState(false);
  const [economy, setEconomy] = useState<{ lifetimeDeposited: number; liveFactor: number } | null>(null);

  // Seed the form from the signed-in user whenever it changes.
  useEffect(() => {
    if (user) {
      setName(user.name);
      setContact(user.email ?? user.phone ?? "");
      api<{ lifetimeDeposited: number; liveFactor: number }>("/api/games/economy")
        .then(setEconomy)
        .catch(() => setEconomy(null));
    }
  }, [user]);

  if (!user) {
    return (
      <main className="rg48-page-main"><div className="wrap">
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
    <main className="rg48-page-main">
      <div className="wrap">
        <div className="rg48-hbar-in">
          <Link className="gp-back" href="/account" aria-label="Back to account"><span className="gp-back-coin">←</span></Link>
        </div>
        <h2>Your <em>settings</em></h2>
        <p className="rg48-mini">Profile, password and preferences for {user.name}.</p>

        <section className="admin-sec">
          <h3>Profile</h3>
          <form onSubmit={saveProfile}>
            <div className="rg48-f"><label htmlFor="stName">Full name</label><input id="stName" type="text" value={name} onChange={(e) => setName(e.target.value)} required /></div>
            <div className="rg48-f"><label htmlFor="stContact">Email or phone</label><input id="stContact" type="text" value={contact} onChange={(e) => setContact(e.target.value)} required /></div>
            <p className="rg48-mini">One contact only — an email or a phone number. Changing it changes how you log in.</p>
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
            <p className="rg48-mini">SIM is demo play — no real money moves. REAL plays with your cash balance.</p>
          </div>
        </section>

        <section className="admin-sec">
          <h3>How winning works</h3>
          <p>SIM is demo play — no real money moves, and winning comes easier so you can test the games.</p>
          <p>LIVE win chance starts at the game&apos;s normal rate and falls as your total deposits grow — 5% lower for every GH₵100 deposited, never below half the normal rate.</p>
          {economy && (
            <p>Your total deposits: <b>{fmtCash(economy.lifetimeDeposited)}</b> — your LIVE win chance right now is <b>{Math.round(economy.liveFactor * 100)}%</b> of normal.</p>
          )}
          <p className="rg48-mini">Crash games (Aviator, Jet Fly, Car Crash) are provably fair and never adjusted. Coin games are not affected.</p>
        </section>

        <section className="admin-sec">
          <h3>Your account</h3>
          <div className="sum-cards">
            <div className="sum-card"><span>CASH</span><b>{fmtCash(cash)}</b></div>
            <div className="sum-card"><span>COINS</span><b>{fmtCoins(coins)}</b></div>
            <div className="sum-card"><span>SIM</span><b>{fmtCoins(sim)}</b></div>
            <div className="sum-card"><span>LEVEL</span><b>{user.level} · {user.xp} XP</b></div>
          </div>
          <p>Role: <b>{user.role}</b></p>
          <p>Joined: <b>{new Date(user.createdAt).toLocaleDateString("en-GB")}</b></p>
          <p>Referral code used: <b>{user.referralCodeUsed ?? "—"}</b></p>
          <p className="rg48-mini">Currency is Ghana cedi (GH₵) for everyone. Changing country or currency is not available.</p>
          <p><Link className="linklike" href="/account">Back to my account →</Link></p>
        </section>
      </div>
    </main>
  );
}
