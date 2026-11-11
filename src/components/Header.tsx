// Header — v48 structure (brand, chip nav, balance pill, coin pill,
// Deposit, Login/Register or account chip), with the v48 phone-header
// defect FIXED: Register stays visible under 640px and the logged-in
// account name shows beside the cash + coin balances.

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { fmtCash, fmtCoins } from "../lib/api";
import { useStore } from "../lib/store";

export default function Header() {
  const { user, wallet, mode, setMode, muted, toggleMute, openAuth, logout, setDepositOpen } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setHidden(y > 140 && y > lastY.current);
      lastY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const cash = wallet?.cash ?? user?.cash ?? 0;
  const coins = wallet?.coins ?? user?.coins ?? 0;
  const sim = wallet?.sim ?? user?.sim ?? 0;
  const shownBal = mode === "SIM" ? sim : cash;

  return (
    <div className="hdr-zone" style={{ transform: hidden ? "translateY(-110%)" : "translateY(0)", transition: "transform .3s ease", position: "sticky", top: 0, zIndex: 60 }}>
      <header className="site" id="siteHdr">
        <div className="wrap hdr-main">
          <Link className="brand" href="/" aria-label="Royale Gold home">
            <span className="coin-mark">
              <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 2C9 7 4 9 4 13a8 8 0 0 0 16 0c0-4-5-6-8-11z" /></svg>
            </span>
            <span className="brand-text">
              <span className="brand-name">Royale <em>Gold</em></span>
              <small>CASINO · ACCRA</small>
            </span>
          </Link>
          <nav className="chipnav" aria-label="Main">
            <Link href="/games" className="active">Casino</Link>
            <Link href="/games">Games</Link>
            <Link href="/games?filter=crash">Crash</Link>
            <Link href="/games?filter=table">Table</Link>
            <Link href="/#promos">Promotions</Link>
          </nav>
          <div className="hdr-right">
            <div className="mode-toggle" role="group" aria-label="Real or demo cash">
              <button type="button" className={mode === "REAL" ? "on" : ""} onClick={() => setMode("REAL")} aria-pressed={mode === "REAL"}>REAL</button>
              <button type="button" className={mode === "SIM" ? "on" : ""} onClick={() => setMode("SIM")} aria-pressed={mode === "SIM"}>SIM</button>
            </div>
            <button className="icon-btn" type="button" aria-label={muted ? "Unmute sound" : "Mute sound"} onClick={toggleMute}>
              {muted ? (
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4z" /><path stroke="#E5322D" strokeWidth="2.4" strokeLinecap="round" d="M16.5 9.5l5 5M21.5 9.5l-5 5" /></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4z" /><path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M16 9.5a3.4 3.4 0 0 1 0 5M18.4 7a6.6 6.6 0 0 1 0 10" /></svg>
              )}
            </button>
            <div className="bal-pill" aria-label="Wallet balance">
              <span className="bal-coin" aria-hidden="true">₵</span>
              <div>
                <small>{mode === "SIM" ? "SIM BALANCE" : "BALANCE"}</small>
                <strong>{mode === "SIM" ? `SIM ${sim.toLocaleString("en-GH")}` : fmtCash(shownBal)}</strong>
              </div>
            </div>
            <div className="coin-pill" aria-label="Coin balance — play-only, never withdrawable">
              <span className="cp-ico" aria-hidden="true">◉</span>
              <span>
                <small>COINS</small>
                <b>{fmtCoins(coins)}</b>
              </span>
            </div>
            <button className="btn btn-gold btn-dep" type="button" onClick={() => (user ? setDepositOpen(true) : openAuth("login"))}>Deposit</button>
            <div className="acct-box">
              {!user ? (
                <>
                  <button className="btn btn-ghost btn-acct" type="button" onClick={() => openAuth("login")}>Log in</button>
                  <button className="btn btn-gold btn-acct" type="button" onClick={() => openAuth("register")}>Register</button>
                </>
              ) : (
                <div className="acct-wrap">
                  <button className="acct-chip" type="button" aria-haspopup="true" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
                    <span className="ac-av">{user.name.trim().charAt(0).toUpperCase()}</span>
                    <span className="ac-id">
                      <span className="ac-name">{user.name.split(" ")[0]}</span>
                      <span className="ac-role">{user.role === "owner" ? "Owner" : user.role === "admin" ? "Admin" : "Player"}</span>
                    </span>
                    <span className="ac-bals">
                      <span className="ac-bal">{fmtCash(cash)}</span>
                      <span className="ac-bal coin">◉ {fmtCoins(coins)}</span>
                    </span>
                  </button>
                  {menuOpen && (
                    <div className="acct-menu" role="menu">
                      <Link href="/account" onClick={() => setMenuOpen(false)}>My account</Link>
                      {(user.role === "admin" || user.role === "owner") && <Link href="/admin" onClick={() => setMenuOpen(false)}>Admin panel</Link>}
                      {user.role === "owner" && <Link href="/owner" onClick={() => setMenuOpen(false)}>Owner panel</Link>}
                      <button type="button" onClick={() => { setMenuOpen(false); void logout(); }}>Log out</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="hdr-ticker" aria-label="Jackpot ticker">
          <div className="tk-track">
            <span className="tk-item"><i />GH₵ 9.4M paid out · sample</span>
            <span className="tk-item"><i />Aviator Gold ×50 max</span>
            <span className="tk-item"><i />Daily bonus +100 SIM · +5 coins</span>
          </div>
        </div>
        <div className="ver-strip"><span className="xg-ver hdr-ver" aria-hidden="true">v48</span></div>
      </header>
    </div>
  );
}
