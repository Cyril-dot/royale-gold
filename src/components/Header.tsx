// Header — v48 structure (brand, chip nav, search, LV chip, balance pill
// with eye, coin pill, Deposit, Login/Register or account chip), plus
// the jackpot ticker with the export's content and live counter.
// Phone tier (export): search + LV chip retire under 640px, the header
// condenses to coin logo + balance + Deposit.

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { fmtCash, fmtCoins } from "../lib/api";
import { useJackpot } from "../lib/jackpot";
import { useStore } from "../lib/store";

export default function Header() {
  const { user, wallet, mode, setMode, muted, toggleMute, openAuth, logout, setDepositOpen } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [balHidden, setBalHidden] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const lastY = useRef(0);
  const router = useRouter();
  const { jackpotText } = useJackpot();

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
  const balText = balHidden ? "••••••" : mode === "SIM" ? `SIM ${sim.toLocaleString("en-GH")}` : fmtCash(shownBal);

  const tickerItems = (
    <>
      <span className="tk-item"><i />MEGA JACKPOT <b className="jp-val">{jackpotText}</b></span>
      <span className="tk-item"><i />DROPS BEFORE GH₵ 500,000</span>
      <span className="tk-item"><i />FRIDAY CASH RACE <b>GH₵ 25,000</b></span>
      <span className="tk-item"><i />WELCOME BONUS <b>100% UP TO GH₵ 1,000</b></span>
    </>
  );

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQ.trim();
    router.push(q ? `/games?q=${encodeURIComponent(q)}` : "/games");
    setSearchOpen(false);
  };

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
            <Link href="/games?filter=slots">Slots</Link>
            <Link href="/games?filter=table">Table</Link>
            <Link href="/games?filter=live">Live</Link>
            <Link href="/#promos">Promotions</Link>
          </nav>
          <div className="hdr-right">
            <button className="icon-btn" id="searchBtn" type="button" aria-label="Search games" aria-expanded={searchOpen} onClick={() => setSearchOpen((v) => !v)}>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z" /></svg>
            </button>
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
            <div className="xp-chip" id="xpChip" aria-label="Experience level">
              <span className="xp-lvl">LV <b>{user?.level ?? 1}</b></span>
              <span className="xp-bar"><i style={{ width: `${(user?.xp ?? 0) % 100}%` }} /></span>
            </div>
            <div className="bal-pill" aria-label="Wallet balance">
              <span className="bal-coin" aria-hidden="true">₵</span>
              <div>
                <small>{mode === "SIM" ? "SIM BALANCE" : "BALANCE"}</small>
                <strong>{balText}</strong>
              </div>
              <button className="eye" type="button" aria-label={balHidden ? "Show balance" : "Hide balance"} onClick={() => setBalHidden((v) => !v)}>
                <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 5C6.5 5 2 12 2 12s4.5 7 10 7 10-7 10-7-4.5-7-10-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-6.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z" /></svg>
              </button>
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
          <div className="tk-track" id="jackpotTrack">
            {tickerItems}
            {tickerItems}
          </div>
        </div>
        <div className={`search-row${searchOpen ? " open" : ""}`} id="searchRow">
          <div className="wrap search-inner">
            <svg width="21" height="21" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z" /></svg>
            <form onSubmit={submitSearch} style={{ flex: 1, display: "flex" }}>
              <input type="search" placeholder="Search games — slots, crash, roulette…" aria-label="Search games" value={searchQ} onChange={(e) => setSearchQ(e.target.value)} autoFocus={searchOpen} />
            </form>
            <button className="icon-btn" type="button" aria-label="Close search" onClick={() => setSearchOpen(false)}>✕</button>
          </div>
        </div>
        <div className="ver-strip"><span className="xg-ver hdr-ver" aria-hidden="true">v48</span></div>
      </header>
    </div>
  );
}
