// Header — v48 structure (brand, chip nav, search, LV chip, coin pill,
// Join now or account chip), plus the jackpot ticker with the export's
// content and live counter. Round 11: NO Deposit button anywhere — the
// coin pill and submenu coins row link to the wallet page. Round 14g:
// the account-chip figures were removed (cash + coins). Round 15: the
// balance pill/tab is GONE entirely; the balance lives in the phone
// hamburger submenu again (Balance row, first); the chip carries a 👑
// crown after the name; signed-out shows ONE gold "Join now" button
// opening the toggle-based auth modal; header polish — premium chip,
// richer gold bottom line, breathing room. Round 15d: the cash balance
// is back in the chip as a bare number (no GH₵ / SIM prefix) next to
// the name, and the role text is gone — the chip is single-line:
// avatar + name + 👑 + balance. No coins figure.
// Phone tier (export): search + LV chip retire under 640px, the header
// condenses to coin logo + balance.

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { fmtMoney, fmtCoins } from "../lib/api";
import { useJackpot } from "../lib/jackpot";
import { useStore } from "../lib/store";

export default function Header() {
  const { user, wallet, mode, setMode, muted, toggleMute, openAuth, logout, simSession } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsBtnRef = useRef<HTMLButtonElement | null>(null);
  const toolsPanelRef = useRef<HTMLDivElement | null>(null);
  const [hidden, setHidden] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const lastY = useRef(0);
  const router = useRouter();
  const pathname = usePathname();
  const { jackpotText } = useJackpot();
  // P1 Batch 4 (O21): the site name comes from the public config
  // endpoint (the owner sets it in Platform settings). Default
  // "Royale Gold" until the fetch lands; last word in <em> like the
  // original brand lockup.
  const [siteName, setSiteName] = useState("Royale Gold");
  useEffect(() => {
    let live = true;
    fetch("/api/games/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (live && j?.siteName) setSiteName(j.siteName);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const nameParts = siteName.trim().split(/\s+/).filter(Boolean);
  const brandFirst = nameParts.length > 1 ? nameParts.slice(0, -1).join(" ") : "";
  const brandLast = nameParts.length > 1 ? nameParts[nameParts.length - 1] : siteName;

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const hiding = y > 140 && y > lastY.current;
      setHidden(hiding);
      if (hiding) setToolsOpen(false);
      lastY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Tools submenu: close on route change.
  useEffect(() => { setToolsOpen(false); }, [pathname]);

  // Tools submenu: close on outside tap / Esc, focus the first row on open.
  useEffect(() => {
    if (!toolsOpen) return;
    const panel = toolsPanelRef.current;
    panel?.querySelector<HTMLElement>("button")?.focus();
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (toolsPanelRef.current?.contains(t)) return;
      if (toolsBtnRef.current?.contains(t)) return;
      setToolsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setToolsOpen(false);
        toolsBtnRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [toolsOpen]);

  const cash = wallet?.cash ?? user?.cash ?? 0;
  const coins = wallet?.coins ?? user?.coins ?? 0;
  // Round 12 follow-up: in SIM mode show the LIVE session counter, not the
  // server value — otherwise the header pill and the room bar disagree
  // after playing in SIM (the server SIM only moves on signup + daily claim).
  const sim = simSession ?? wallet?.sim ?? user?.sim ?? 0;
  const shownBal = mode === "SIM" ? sim : cash;
  const balText = mode === "SIM" ? `SIM ${sim.toLocaleString("en-GH")}` : fmtMoney(shownBal, user?.currency ?? "GHS");
  // Round 15d: the chip shows the balance as a bare number — no "GH₵ "
  // prefix in REAL mode, no "SIM" prefix in SIM mode (the REAL/SIM toggle
  // already shows the mode). balText keeps its full labels for the
  // submenu Balance row; only the chip drops the prefixes.
  const chipBal = mode === "SIM" ? sim.toLocaleString("en-GH") : Number(shownBal).toFixed(2);

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

  // Round 21: game rooms get their own header (GameRoomHeader) — the
  // site header stays off /games/<slug>. The list page (/games) and
  // every other page keep it.
  if (pathname?.startsWith("/games/")) return null;

  return (
    <div className="hdr-zone" style={{ transform: hidden ? "translateY(-110%)" : "translateY(0)", transition: "transform .3s ease", position: "sticky", top: 0, zIndex: 60 }}>
      <header className="site" id="siteHdr">
        <div className="wrap hdr-main">
          <Link className="brand" href="/" aria-label={`${siteName} home`}>
            {/* Header mark — the Gemini logo roundel (/icon.png). The
                .coin-mark span keeps its v48 sizing (44px desktop, 32px
                phone); its coin styling is stripped in hdr-menu.css so
                the roundel fills the circle. */}
            <span className="coin-mark">
              <img src="/icon.png" alt="" aria-hidden="true" />
            </span>
            <span className="brand-text">
              <span className="brand-name">
                {brandFirst ? `${brandFirst} ` : ""}
                <em>{brandLast}</em>
              </span>
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
          <div className="hdr-row hdr-row-1">
            <button className="icon-btn" id="searchBtn" type="button" aria-label="Search games" aria-expanded={searchOpen} onClick={() => setSearchOpen((v) => !v)}>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z" /></svg>
            </button>
            <div className="mode-toggle" role="group" aria-label="Real or SIM cash">
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
          </div>
          <div className="hdr-row hdr-row-2">
            <Link href="/wallet" className="coin-pill" aria-label="Coin balance — play-only, never withdrawable">
              <span className="cp-ico" aria-hidden="true">◉</span>
              <span>
                <small>COINS</small>
                <b>{fmtCoins(coins)}</b>
              </span>
            </Link>
          </div>
          <div className="hdr-row hdr-row-3">
            <div className="acct-box">
              {!user ? (
                <button className="btn btn-gold btn-acct" type="button" onClick={() => openAuth("register")}>Join now</button>
              ) : (
                <div className="acct-wrap">
                  <button className="acct-chip" type="button" aria-haspopup="true" aria-expanded={menuOpen} onClick={() => { setToolsOpen(false); setMenuOpen((v) => !v); }}>
                    <span className="ac-av">{user.name.trim().charAt(0).toUpperCase()}</span>
                    <span className="ac-id">
                      <span className="ac-name">{user.name.split(" ")[0]} <span className="ac-crown" aria-hidden="true">👑</span></span>
                    </span>
                    <span className="ac-bals">
                      <span className="ac-bal">{chipBal}</span>
                    </span>
                  </button>
                  {menuOpen && (
                    <div className="acct-menu" role="menu">
                      <Link href="/account" onClick={() => setMenuOpen(false)}>My account</Link>
                      <Link href="/wallet" onClick={() => setMenuOpen(false)}>Wallet</Link>
                      <Link href="/settings" onClick={() => setMenuOpen(false)}>Settings</Link>
                      {(user.role === "admin" || user.role === "owner") && <Link href="/admin" onClick={() => setMenuOpen(false)}>Admin panel</Link>}
                      {user.role === "owner" && <Link href="/owner" onClick={() => setMenuOpen(false)}>Owner panel</Link>}
                      <button type="button" onClick={() => { setMenuOpen(false); void logout(); }}>Log out</button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <button ref={toolsBtnRef} className="icon-btn hdr-menu-btn" type="button" aria-label="More options" aria-haspopup="true" aria-expanded={toolsOpen} aria-controls="hdrToolsMenu" onClick={() => { setMenuOpen(false); setToolsOpen((v) => !v); }}>
              {toolsOpen ? (
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" /></svg>
              )}
            </button>
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
      </header>
      {toolsOpen && (
        <div ref={toolsPanelRef} className="hdr-tools-menu" id="hdrToolsMenu" role="menu" aria-label="More options">
          {user && (
            <>
              <Link href="/wallet" className="htm-row" role="menuitem" onClick={() => setToolsOpen(false)}>
                <span className="bal-coin htm-ico" aria-hidden="true">₵</span>
                <span className="htm-lab">{mode === "SIM" ? "SIM balance" : "Balance"}</span>
                <span className="htm-ctl">
                  <span className="htm-val">{balText}</span>
                </span>
              </Link>
              {mode === "REAL" && wallet?.stake !== undefined && (
                <>
                  <Link href="/wallet" className="htm-row" role="menuitem" onClick={() => setToolsOpen(false)}>
                    <span className="bal-coin htm-ico" aria-hidden="true">₵</span>
                    <span className="htm-lab">Stake</span>
                    <span className="htm-ctl">
                      <span className="htm-val">{fmtMoney(wallet.stake, user?.currency ?? "GHS")}</span>
                    </span>
                  </Link>
                  <Link href="/wallet" className="htm-row" role="menuitem" onClick={() => setToolsOpen(false)}>
                    <span className="bal-coin htm-ico" aria-hidden="true">₵</span>
                    <span className="htm-lab">Winnings</span>
                    <span className="htm-ctl">
                      <span className="htm-val">{fmtMoney(wallet.winnings ?? 0, user?.currency ?? "GHS")}</span>
                    </span>
                  </Link>
                </>
              )}
              <Link href="/wallet" className="htm-row" role="menuitem" onClick={() => setToolsOpen(false)}>
                <span className="cp-ico htm-ico" aria-hidden="true">◉</span>
                <span className="htm-lab">Coins</span>
                <span className="htm-ctl">
                  <span className="htm-val coin">{fmtCoins(coins)}</span>
                </span>
              </Link>
              <Link href="/wallet/convert" className="htm-row" role="menuitem" onClick={() => setToolsOpen(false)}>
                <span className="bal-coin htm-ico" aria-hidden="true">⇄</span>
                <span className="htm-lab">Convert</span>
              </Link>
            </>
          )}
          <button type="button" className="htm-row" role="menuitem" onClick={() => { setToolsOpen(false); setSearchOpen(true); }}>
            <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z" /></svg>
            <span className="htm-lab">Search games</span>
          </button>
          <div className="htm-row" role="menuitem">
            <span className="htm-lab">Cash mode</span>
            <span className="htm-ctl">
              <span className="mode-toggle" role="group" aria-label="Real or SIM cash">
                <button type="button" className={mode === "REAL" ? "on" : ""} onClick={() => setMode("REAL")} aria-pressed={mode === "REAL"}>REAL</button>
                <button type="button" className={mode === "SIM" ? "on" : ""} onClick={() => setMode("SIM")} aria-pressed={mode === "SIM"}>SIM</button>
              </span>
            </span>
          </div>
          <div className="htm-row" role="menuitem">
            <span className="htm-lab">Sound {muted ? "off" : "on"}</span>
            <span className="htm-ctl">
              <button className="icon-btn" type="button" aria-label={muted ? "Unmute sound" : "Mute sound"} onClick={toggleMute}>
                {muted ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4z" /><path stroke="#E5322D" strokeWidth="2.4" strokeLinecap="round" d="M16.5 9.5l5 5M21.5 9.5l-5 5" /></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4z" /><path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M16 9.5a3.4 3.4 0 0 1 0 5M18.4 7a6.6 6.6 0 0 1 0 10" /></svg>
                )}
              </button>
            </span>
          </div>
          <div className="htm-row" role="menuitem">
            <span className="htm-lab">Level</span>
            <span className="htm-ctl">
              <span className="xp-chip" aria-label="Experience level">
                <span className="xp-lvl">LV <b>{user?.level ?? 1}</b></span>
                <span className="xp-bar"><i style={{ width: `${(user?.xp ?? 0) % 100}%` }} /></span>
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
