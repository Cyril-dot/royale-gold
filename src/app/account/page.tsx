// Account page — a gaming profile, not a settings form.
// Profile hero (avatar, level + XP bar), wallet summary, REAL/SIM stats
// grid, per-game breakdown, recent history, achievements, referral +
// daily bonus. Profile editing lives on /settings — this page shows
// stats. All numbers come from /api/games/stats + /api/games/history
// (REAL) and localStorage rg-sim-stats (SIM, mirrored from the
// StatsStrip logic in components/games/shared.tsx). Nothing is invented:
// totals the APIs do not return are computed from the rows that ARE
// returned, and labelled as such.

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, fmtMoney, fmtCoins, GameStat, GameHistoryRow } from "../../lib/api";
import { symbolFor } from "../../lib/country";
import { avatarFor } from "../../lib/avatar";
import { useStore } from "../../lib/store";
import { getGame } from "../../lib/games";

type ModeTab = "REAL" | "SIM";

interface Totals {
  played: number;
  wins: number;
  losses: number;
  winRate: number;
  streak: number;
  bestCash: number;
  bestCoins: number;
}

function aggregate(stats: GameStat[]): Totals {
  let played = 0;
  let wins = 0;
  let losses = 0;
  let streak = 0;
  let bestCash = 0;
  let bestCoins = 0;
  for (const s of stats) {
    played += s.played;
    wins += s.wins;
    losses += s.losses;
    if (s.streak > streak) streak = s.streak;
    const g = getGame(s.game);
    if (g?.currency === "coins") {
      if (s.best > bestCoins) bestCoins = s.best;
    } else if (s.best > bestCash) {
      bestCash = s.best;
    }
  }
  return { played, wins, losses, winRate: played > 0 ? wins / played : 0, streak, bestCash, bestCoins };
}

function readSimStats(): GameStat[] {
  try {
    const all = JSON.parse(localStorage.getItem("rg-sim-stats") || "{}") as Record<string, GameStat>;
    return Object.values(all).filter((s) => s.played > 0);
  } catch {
    return [];
  }
}

function when(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

const BADGE_ICONS: Record<string, React.ReactNode> = {
  win: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M7 5H4a3 3 0 0 0 3 5M17 5h3a3 3 0 0 1-3 5" /><path d="M12 14v3M8 21h8M10 17h4" /></svg>
  ),
  games: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" /><circle cx="12" cy="12" r="0.6" /></svg>
  ),
  grind: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="6" /><path d="M8.5 13.5 7 21l5-2.5L17 21l-1.5-7.5" /></svg>
  ),
  streak: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c1 3-2 4.5-2 7a4 4 0 0 0 8 0c0-1.5-.8-2.6-1.5-3.5C15 8 15 9 14 9c.5-2.5-.5-4.5-2-6Z" /><path d="M9 21c-1.5-2 0-3.5 1-5" /></svg>
  ),
  big: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16l-1.5 9a3 3 0 0 1-3 2.5h-7a3 3 0 0 1-3-2.5L4 7Z" /><path d="M8 7 12 3l4 4M12 10v5" /></svg>
  ),
  roller: (
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 7v10M15.5 9.5c-.8-1-2-1.5-3.5-1.5-2 0-3.2 1-3.2 2.4 0 3.2 7 1.4 7 4.4 0 1.4-1.4 2.4-3.8 2.4-1.6 0-2.9-.6-3.7-1.6" /></svg>
  ),
};

export default function AccountPage() {
  const { user, wallet, mode, openAuth, logout, toast, refresh } = useStore();
  const [tab, setTab] = useState<ModeTab>(mode);
  const [stats, setStats] = useState<GameStat[] | null>(null);
  const [history, setHistory] = useState<GameHistoryRow[]>([]);
  const [simStats, setSimStats] = useState<GameStat[]>([]);
  // Phase 1 country-based (Nov 2026): the player's fiat + the GHS→fiat
  // factor for the badge thresholds (100 / 1,000 are GHS-term numbers).
  const fiat = user?.currency ?? "GHS";
  const sym = symbolFor(fiat);
  const [factor, setFactor] = useState(1);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api<{ currencies: { currency: string; conversionRate: number }[] }>("/api/games/config")
      .then((r) => {
        if (cancelled) return;
        const row = r.currencies?.find((c) => c.currency === fiat);
        if (row) setFactor((row.conversionRate || 5) / 5);
      })
      .catch(() => { /* GHS defaults stay */ });
    return () => { cancelled = true; };
  }, [user, fiat]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  // P1 Batch 1 (A18): promo code redeem — a bonus from any admin, in
  // cash or coins (unlike the referral redeem, which is +5 coins once).
  const [promoCode, setPromoCode] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);
  const [claimBusy, setClaimBusy] = useState(false);
  // P0 Batch 3 (A11): support tickets — open one from here; it goes to
  // the admin who referred you. Your tickets are listed below the form.
  const [tkSubject, setTkSubject] = useState("");
  const [tkBody, setTkBody] = useState("");
  const [tkBusy, setTkBusy] = useState(false);
  const [myTickets, setMyTickets] = useState<{ id: string; subject: string; status: string; messages: number; updatedAt: string }[] | null>(null);
  // P1 Batch 2 (A21): KYC — submit a document link for verification.
  // KYC never blocks deposits or play; it is verification only.
  const [kyc, setKyc] = useState<{ documentType: string; documentTypeLabel: string; documentUrl: string; status: string; submittedAt: string; rejectionReason: string | null } | null>(null);
  const [kycDocType, setKycDocType] = useState("national_id");
  const [kycDocUrl, setKycDocUrl] = useState("");
  const [kycBusy, setKycBusy] = useState(false);
  // P1 Batch 4 (O22): the document types the owner accepts, read from
  // the public KYC settings (defaults to all three until it lands).
  const [kycTypes, setKycTypes] = useState<{ type: string; label: string }[]>([
    { type: "national_id", label: "National ID" },
    { type: "passport", label: "Passport" },
    { type: "drivers_licence", label: "Driver's licence" },
  ]);
  // P1 Batch 4 (O21): the support contact the owner set (email or
  // WhatsApp number), shown on the Support form. Empty = not shown.
  const [supportContact, setSupportContact] = useState("");
  // P1 Batch 2 (A23): in-app notifications from your admin.
  const [myNotifs, setMyNotifs] = useState<{ id: string; title: string; body: string; from: string; readAt: string | null; createdAt: string }[] | null>(null);
  const [notifUnread, setNotifUnread] = useState(0);
  // P2 Batch 1 (A29): my own limits — self-exclusion banner + the
  // Take a break buttons. Read from the same limits table the admin
  // edits; a self-exclusion or a live cool-off shows here.
  const [myLimits, setMyLimits] = useState<{ selfExcludedUntil: string | null; selfExclusionReason: string | null; coolOffUntil: string | null; realityCheckMinutes: number } | null>(null);
  const [breakBusy, setBreakBusy] = useState(false);
  // P2 Batch 2 (O28): birthday — optional, set here on the account
  // page. The loyalty birthday bonus pays on it, once per year.
  const [birthday, setBirthday] = useState("");
  const [birthdayBusy, setBirthdayBusy] = useState(false);
  useEffect(() => { setBirthday(user?.birthday ?? ""); }, [user?.birthday]);

  const saveBirthday = async (e: React.FormEvent) => {
    e.preventDefault();
    setBirthdayBusy(true);
    try {
      await api("/api/auth/me", { method: "PATCH", body: JSON.stringify({ birthday }) });
      toast(birthday ? `Birthday saved — ${new Date(`${birthday}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}` : "Birthday cleared", "win");
      await refresh();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not save birthday", "lose");
    } finally { setBirthdayBusy(false); }
  };

  const loadMyLimits = async () => {
    try {
      const r = await api<{ limits: { selfExcludedUntil: string | null; selfExclusionReason: string | null; coolOffUntil: string | null; realityCheckMinutes: number } }>("/api/player/limits");
      setMyLimits(r.limits);
    } catch { setMyLimits(null); }
  };

  const takeBreak = async (days: number) => {
    setBreakBusy(true);
    try {
      const r = await api<{ limits: { coolOffUntil: string } }>("/api/player/break", { method: "POST", body: JSON.stringify({ days }) });
      toast(`Cool-off set until ${new Date(r.limits.coolOffUntil).toLocaleDateString("en-GB")} — play is off until then`, "win");
      await loadMyLimits();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not set the break", "lose");
    } finally { setBreakBusy(false); }
  };

  const loadKyc = async () => {
    try {
      const r = await api<{ submission: { documentType: string; documentTypeLabel: string; documentUrl: string; status: string; submittedAt: string; rejectionReason: string | null } | null }>("/api/kyc/mine");
      setKyc(r.submission);
    } catch { setKyc(null); }
  };

  const loadNotifs = async () => {
    try {
      const r = await api<{ unread: number; notifications: { id: string; title: string; body: string; from: string; readAt: string | null; createdAt: string }[] }>("/api/notifications");
      setMyNotifs(r.notifications ?? []);
      setNotifUnread(r.unread ?? 0);
    } catch { setMyNotifs([]); }
  };

  useEffect(() => {
    if (!user) return;
    void loadKyc();
    void loadNotifs();
    void loadMyLimits();
    // P1 Batch 4 (O22/O21): the accepted document types + the support
    // contact, both owner-set. A type the owner removed disappears from
    // the submit form; the selected type is clamped to the list.
    fetch("/api/kyc/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j || !Array.isArray(j.acceptedTypes) || j.acceptedTypes.length === 0) return;
        const list = j.acceptedTypes.map((t: string) => ({ type: t, label: j.labels?.[t] ?? t }));
        setKycTypes(list);
        setKycDocType((cur) => (list.some((x: { type: string }) => x.type === cur) ? cur : list[0].type));
      })
      .catch(() => {});
    fetch("/api/games/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.supportContact) setSupportContact(j.supportContact);
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) return;
    api<{ tickets: { id: string; subject: string; status: string; messages: number; updatedAt: string }[] }>("/api/tickets")
      .then((r) => setMyTickets(r.tickets ?? []))
      .catch(() => setMyTickets([]));
  }, [user]);

  const submitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setTkBusy(true);
    try {
      await api("/api/tickets", { method: "POST", body: JSON.stringify({ subject: tkSubject.trim(), body: tkBody.trim() }) });
      toast("Ticket sent — your admin will reply here", "win");
      setTkSubject("");
      setTkBody("");
      const r = await api<{ tickets: { id: string; subject: string; status: string; messages: number; updatedAt: string }[] }>("/api/tickets");
      setMyTickets(r.tickets ?? []);
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not send ticket", "lose");
    } finally { setTkBusy(false); }
  };

  useEffect(() => {
    if (!user) return;
    setSimStats(readSimStats());
    let cancelled = false;
    api<{ stats: GameStat[] }>("/api/games/stats")
      .then((r) => { if (!cancelled) setStats(r.stats ?? []); })
      .catch(() => { if (!cancelled) setStats([]); });
    api<{ history: GameHistoryRow[] }>("/api/games/history?limit=100")
      .then((r) => { if (!cancelled) setHistory(r.history ?? []); })
      .catch(() => { if (!cancelled) setHistory([]); });
    return () => { cancelled = true; };
  }, [user]);

  const realTotals = useMemo(() => aggregate(stats ?? []), [stats]);
  const simTotals = useMemo(() => aggregate(simStats), [simStats]);
  const active = tab === "SIM" ? simTotals : realTotals;
  const activeStats = tab === "SIM" ? simStats : (stats ?? []);

  // Cash totals from the history rows actually returned (last 100 rounds).
  const cashFlow = useMemo(() => {
    let wagered = 0;
    let won = 0;
    for (const h of history) {
      if (h.currency !== "cash") continue;
      wagered += h.stake;
      won += h.payout;
    }
    return { wagered, won, net: won - wagered };
  }, [history]);

  const perGame = useMemo(
    () => [...activeStats].sort((a, b) => b.played - a.played),
    [activeStats]
  );

  const achievements = useMemo(() => {
    const t = realTotals;
    // Phase 1 country-based (Nov 2026): the 100 / 1,000 badge bars are
    // GHS-term numbers, scaled to the player's fiat (NGN: 10,000 /
    // 100,000) — an NGN player is never "High Roller" for ₦1,500.
    const bigBar = 100 * factor;
    const rollerBar = 1000 * factor;
    return [
      { id: "win", name: "First Win", desc: "Win your first game", icon: BADGE_ICONS.win, unlocked: t.wins >= 1, progress: `${Math.min(t.wins, 1)}/1` },
      { id: "games", name: "Warming Up", desc: "Play 10 games", icon: BADGE_ICONS.games, unlocked: t.played >= 10, progress: `${Math.min(t.played, 10)}/10` },
      { id: "grind", name: "Grinder", desc: "Play 50 games", icon: BADGE_ICONS.grind, unlocked: t.played >= 50, progress: `${Math.min(t.played, 50)}/50` },
      { id: "streak", name: "Hot Streak", desc: "Win 5 in a row", icon: BADGE_ICONS.streak, unlocked: t.streak >= 5, progress: `${Math.min(t.streak, 5)}/5` },
      { id: "big", name: "Big Win", desc: `Best win ${sym} ${bigBar.toLocaleString("en-GH")}+`, icon: BADGE_ICONS.big, unlocked: t.bestCash >= bigBar, progress: `${sym} ${Math.round(Math.min(t.bestCash, bigBar)).toLocaleString("en-GH")} / ${bigBar.toLocaleString("en-GH")}` },
      { id: "roller", name: "High Roller", desc: `Wager ${sym} ${rollerBar.toLocaleString("en-GH")}+`, icon: BADGE_ICONS.roller, unlocked: cashFlow.wagered >= rollerBar, progress: `${sym} ${Math.round(Math.min(cashFlow.wagered, rollerBar)).toLocaleString("en-GH")} / ${rollerBar.toLocaleString("en-GH")}` },
    ];
  }, [realTotals, cashFlow, factor, sym]);

  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  if (!user) {
    return (
      <main className="rg48-page-main rg23"><div className="wrap">
        <h2>My <em>account</em></h2>
        <p>Log in to see your account.</p>
        <button className="btn btn-gold" type="button" onClick={() => openAuth("login")}>Log in</button>
      </div></main>
    );
  }

  const cash = wallet?.cash ?? user.cash;
  const coins = wallet?.coins ?? user.coins;
  const sim = wallet?.sim ?? user.sim;
  const xpIntoLevel = user.xp % 100;
  const xpToNext = 100 - xpIntoLevel;
  const roleLabel = user.role === "owner" ? "Owner" : user.role === "admin" ? "Admin" : "Player";
  const recent = history.slice(0, 10);

  const redeem = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ coins: number; redeemedCode: string; bonusCoins: number }>("/api/account/redeem", {
        method: "POST",
        body: JSON.stringify({ code: code.trim().toUpperCase() }),
      });
      toast(`Redeemed ${r.redeemedCode} — +${r.bonusCoins} coins`, "win");
      setCode("");
      await refresh();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Redeem failed", "lose");
    } finally { setBusy(false); }
  };

  // P1 Batch 1 (A18): redeem a promo code for its bonus.
  const redeemPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    setPromoBusy(true);
    try {
      const r = await api<{ code: string; bonusAmount: number; bonusCurrency: string }>("/api/promo-codes/redeem", {
        method: "POST",
        body: JSON.stringify({ code: promoCode.trim().toUpperCase() }),
      });
      toast(`Redeemed ${r.code} — +${r.bonusCurrency === "cash" ? fmtMoney(r.bonusAmount, fiat) : `${r.bonusAmount} coins`}`, "win");
      setPromoCode("");
      await refresh();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Redeem failed", "lose");
    } finally { setPromoBusy(false); }
  };

  // P1 Batch 2 (A21): submit a KYC document link for verification.
  const submitKyc = async (e: React.FormEvent) => {
    e.preventDefault();
    setKycBusy(true);
    try {
      await api("/api/kyc/submit", {
        method: "POST",
        body: JSON.stringify({ documentType: kycDocType, documentUrl: kycDocUrl.trim() }),
      });
      toast("KYC submitted — your admin will review it", "win");
      setKycDocUrl("");
      await loadKyc();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "KYC submit failed", "lose");
    } finally { setKycBusy(false); }
  };

  // P1 Batch 2 (A23): mark notifications as read.
  const markNotifRead = async (id: string) => {
    try {
      await api(`/api/notifications/${id}/read`, { method: "POST" });
      await loadNotifs();
    } catch { /* stays unread */ }
  };

  const markAllNotifsRead = async () => {
    try {
      await api("/api/notifications/read-all", { method: "POST" });
      await loadNotifs();
    } catch { /* stays unread */ }
  };

  const claimCoins = async () => {
    setClaimBusy(true);
    try {
      await api("/api/rewards/claim", { method: "POST", body: JSON.stringify({ type: "coins" }) });
      toast("+5 coins claimed", "win");
      await refresh();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Claim failed", "lose");
    } finally { setClaimBusy(false); }
  };

  return (
    <main className="rg48-page-main rg23 ac-page">
      <div className="wrap">
        <div className="rg48-hbar-in">
          <Link className="gp-back" href="/" aria-label="Back"><span className="gp-back-coin">←</span></Link>
          <h2>My <em>account</em></h2>
        </div>

        {/* Profile hero */}
        <section className="ac-hero" aria-label="Profile">
          <div className="ac-avatar" aria-hidden="true">{avatarFor(user.id)}</div>
          <div className="ac-who">
            <h3>{user.name}{user.role === "owner" ? " 👑" : ""}</h3>
            <p>{user.email || user.phone || "—"} · {roleLabel} · Joined {new Date(user.createdAt).toLocaleDateString("en-GB")}</p>
            {/* Phase 1 country-based (Nov 2026): the account shows its
                country + currency — set at register, never changeable. */}
            <p>{user.country === "NG" ? "Nigeria" : "Ghana"} · {fiat} ({sym})</p>
            {user.referralCodeUsed && <p>Referred with code {user.referralCodeUsed}</p>}
          </div>
          <div className="ac-level">
            <span className="ac-level-num">LVL {user.level}</span>
            <div className="ac-xpbar" role="progressbar" aria-valuenow={xpIntoLevel} aria-valuemin={0} aria-valuemax={100} aria-label={`Level ${user.level} progress`}>
              <span style={{ width: `${xpIntoLevel}%` }} />
            </div>
            <span className="ac-xptext">{user.xp} XP · {xpToNext} XP to LVL {user.level + 1}</span>
          </div>
        </section>

        {/* Wallet summary */}
        <section className="ac-wallet" aria-label="Wallet">
          <Link className="ac-wcard" href="/wallet"><span>CASH</span><b>{fmtMoney(cash, fiat)}</b><i>Wallet →</i></Link>
          <Link className="ac-wcard" href="/wallet"><span>COINS</span><b>{fmtCoins(coins)}</b><i>Wallet →</i></Link>
          <Link className="ac-wcard" href="/wallet"><span>SIM</span><b>{fmtCoins(sim)}</b><i>Wallet →</i></Link>
        </section>

        {/* Win logic (Nov 2026): the Stake/Winnings split of the cash
            balance — shown once the wallet split has loaded. */}
        {wallet?.stake !== undefined && (
          <div className="ac-split" aria-label="Cash split">
            <div><span>STAKE</span><b>{fmtMoney(wallet.stake, fiat)}</b></div>
            <div><span>WINNINGS</span><b>{fmtMoney(wallet.winnings ?? 0, fiat)}</b></div>
          </div>
        )}

        {/* P2 Batch 2 (O28): birthday — optional. The loyalty birthday
            bonus pays on this day, once per year, when the owner runs
            "Pay birthday bonuses for today". */}
        <section className="ac-sec" aria-label="Birthday">
          <h3>Birthday</h3>
          <form onSubmit={saveBirthday}>
            <div className="rg48-f"><label htmlFor="acBirthday">Your birthday (optional)</label><input id="acBirthday" type="date" value={birthday} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setBirthday(e.target.value)} /></div>
            <button className="btn btn-gold" type="submit" disabled={birthdayBusy}>{birthdayBusy ? "Saving…" : "Save birthday"}</button>
          </form>
        </section>

        {/* Stats */}
        <section className="ac-sec" aria-label="Stats">
          <div className="ac-sec-head">
            <h3>Your stats</h3>
            <div className="ac-tabs" role="tablist" aria-label="Stats mode">
              {(["REAL", "SIM"] as ModeTab[]).map((m) => (
                <button key={m} type="button" role="tab" aria-selected={tab === m} className={tab === m ? "on" : ""} onClick={() => setTab(m)}>{m}</button>
              ))}
            </div>
          </div>
          {stats === null && tab === "REAL" ? (
            <p>Loading your stats…</p>
          ) : active.played === 0 ? (
            <div className="ac-empty">
              <p>No {tab === "SIM" ? "SIM " : ""}games played yet.</p>
              <Link className="btn btn-gold" href="/games">Play your first game →</Link>
            </div>
          ) : (
            <div className="ac-stats">
              <div className="ac-stat"><span>PLAYED</span><b>{active.played}</b></div>
              <div className="ac-stat"><span>WINS</span><b>{active.wins}</b></div>
              <div className="ac-stat"><span>WIN RATE</span><b>{Math.round(active.winRate * 100)}%</b></div>
              <div className="ac-stat"><span>BEST STREAK</span><b>{active.streak}</b></div>
              <div className="ac-stat"><span>BEST CASH WIN</span><b className="gold">{fmtMoney(active.bestCash, fiat)}</b></div>
              {active.bestCoins > 0 && <div className="ac-stat"><span>BEST COIN WIN</span><b className="gold">{fmtCoins(active.bestCoins)} coins</b></div>}
              {tab === "REAL" && (
                <>
                  <div className="ac-stat"><span>WAGERED</span><b>{fmtMoney(cashFlow.wagered, fiat)}</b></div>
                  <div className="ac-stat"><span>WON BACK</span><b className={cashFlow.net >= 0 ? "gold" : "red"}>{fmtMoney(cashFlow.won, fiat)}</b></div>
                </>
              )}
            </div>
          )}
          {tab === "REAL" && active.played > 0 && <p className="rg48-mini">Wagered / won back are cash totals from your last 100 rounds.</p>}
          {tab === "SIM" && <p className="rg48-mini">SIM is play-money — stats live on this device only.</p>}
        </section>

        {/* Per-game breakdown */}
        {perGame.length > 0 && (
          <section className="ac-sec" aria-label="Per-game breakdown">
            <h3>By game</h3>
            <ul className="ac-games">
              {perGame.map((s) => {
                const g = getGame(s.game);
                const name = g?.name ?? s.game;
                const rate = s.played > 0 ? s.wins / s.played : 0;
                const best = g?.currency === "coins" ? `${fmtCoins(s.best)} coins` : fmtMoney(s.best, fiat);
                return (
                  <li key={s.game}>
                    <Link className="ac-game" href={`/games/${s.game}`}>
                      <span className="ac-game-name">{name}</span>
                      <span className="ac-game-nums">{s.played} played · {s.wins}W – {s.losses}L · best {best}</span>
                      <span className="ac-ratebar" aria-label={`Win rate ${Math.round(rate * 100)} percent`}><span style={{ width: `${Math.round(rate * 100)}%` }} /></span>
                      <span className="ac-rate">{Math.round(rate * 100)}%</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Recent history (REAL only — SIM has no server history) */}
        {tab === "REAL" && recent.length > 0 && (
          <section className="ac-sec" aria-label="Recent history">
            <h3>Recent rounds</h3>
            <ul className="ac-hist">
              {recent.map((h) => {
                const g = getGame(h.game);
                const name = g?.name ?? h.game;
                const net = h.payout - h.stake;
                const won = net > 0;
                const amt = h.currency === "coins" ? `${net > 0 ? "+" : "−"}${fmtCoins(Math.abs(net))} coins` : `${net > 0 ? "+" : "−"}${fmtMoney(Math.abs(net), h.fiatCurrency ?? fiat)}`;
                return (
                  <li key={h.id} className="ac-hist-row">
                    <span className={`ac-result ${won ? "win" : "lose"}`}>{won ? "WON" : "LOST"}</span>
                    <span className="ac-hist-game">{name}</span>
                    <span className="ac-hist-amt">{amt}</span>
                    <span className="ac-hist-when">{when(h.createdAt)}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Achievements */}
        <section className="ac-sec" aria-label="Achievements">
          <div className="ac-sec-head">
            <h3>Achievements</h3>
            <span className="ac-count">{unlockedCount}/{achievements.length} unlocked</span>
          </div>
          <ul className="ac-badges">
            {achievements.map((a) => (
              <li key={a.id} className={`ac-badge${a.unlocked ? " on" : ""}`}>
                <span className="ac-badge-ico" aria-hidden="true">{a.icon}</span>
                <b>{a.name}</b>
                <span>{a.desc}</span>
                <i>{a.unlocked ? "Unlocked" : a.progress}</i>
              </li>
            ))}
          </ul>
        </section>

        {/* Referral + daily */}
        <section className="ac-sec">
          <h3>Redeem a referral code — +5 coins</h3>
          <p className="rg48-mini">One code per account.</p>
          <form className="code-form" onSubmit={redeem}>
            <input type="text" placeholder="e.g. RG-DEMO1" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required />
            <button className="btn btn-gold" type="submit" disabled={busy}>{busy ? "Redeeming…" : "Redeem · +5 coins"}</button>
          </form>
          {(user.role === "admin" || user.role === "owner") && (
            <p><Link className="linklike" href="/admin/referrals">Your referral codes — share and earn →</Link></p>
          )}
        </section>
        {/* P1 Batch 1 (A18): promo code redeem — a bonus from any admin,
            in cash or coins. One redemption per code per player. */}
        <section className="ac-sec">
          <h3>Redeem a promo code</h3>
          <p className="rg48-mini">A bonus from an admin — cash or coins. Each code can be redeemed once per player.</p>
          <form className="code-form" onSubmit={redeemPromo}>
            <input type="text" placeholder="Promo code" value={promoCode} onChange={(e) => setPromoCode(e.target.value.toUpperCase())} required />
            <button className="btn btn-gold" type="submit" disabled={promoBusy}>{promoBusy ? "Redeeming…" : "Redeem promo"}</button>
          </form>
        </section>
        {/* P1 Batch 2 (A21): identity check — submit a link to your ID
            document. KYC never blocks deposits or play; it is
            verification only. */}
        <section className="ac-sec">
          <h3>Identity check (KYC)</h3>
          {kyc && kyc.status === "approved" ? (
            <p>Approved — your {kyc.documentTypeLabel} was verified{` · ${new Date(kyc.submittedAt).toLocaleDateString("en-GB")}`}.</p>
          ) : kyc && kyc.status === "pending" ? (
            <p>Under review — you submitted a {kyc.documentTypeLabel} on {new Date(kyc.submittedAt).toLocaleDateString("en-GB")}. We will let you know the outcome here.</p>
          ) : (
            <>
              {kyc && kyc.status === "rejected" ? (
                <p className="rg48-err">Your {kyc.documentTypeLabel} was rejected{kyc.rejectionReason ? ` — ${kyc.rejectionReason}` : ""}. You can submit again below.</p>
              ) : (
                <p className="rg48-mini">Verify your identity with a link to your ID document. This never blocks deposits or play — it is verification only.</p>
              )}
              <form className="code-form" onSubmit={submitKyc}>
                <select value={kycDocType} onChange={(e) => setKycDocType(e.target.value)} aria-label="Document type">
                  {kycTypes.map((t) => (
                    <option key={t.type} value={t.type}>{t.label}</option>
                  ))}
                </select>
                <input type="url" placeholder="Link to your document (https://…)" value={kycDocUrl} onChange={(e) => setKycDocUrl(e.target.value)} required />
                <button className="btn btn-gold" type="submit" disabled={kycBusy}>{kycBusy ? "Submitting…" : "Submit for review"}</button>
              </form>
            </>
          )}
        </section>
        <section className="ac-sec">
          <h3>Daily bonus</h3>
          <button className="btn btn-gold" type="button" onClick={() => void claimCoins()} disabled={claimBusy}>{claimBusy ? "Claiming…" : "Claim daily +5 coins"}</button>
        </section>
        <section className="ac-sec">
          <h3>Support</h3>
          {supportContact && (
            <p className="rg48-mini">Or reach support directly: <strong>{supportContact}</strong></p>
          )}
          <form className="tk-form" onSubmit={submitTicket}>
            <div className="rg48-f"><label htmlFor="tkSubject">Subject</label><input id="tkSubject" type="text" placeholder="e.g. My deposit has not landed" value={tkSubject} onChange={(e) => setTkSubject(e.target.value)} maxLength={120} required /></div>
            <div className="rg48-f"><label htmlFor="tkBody">What happened?</label><textarea id="tkBody" rows={3} placeholder="Describe the problem…" value={tkBody} onChange={(e) => setTkBody(e.target.value)} maxLength={2000} required /></div>
            <button className="btn btn-gold" type="submit" disabled={tkBusy}>{tkBusy ? "Sending…" : "Send ticket"}</button>
          </form>
          {myTickets === null ? null : myTickets.length === 0 ? (
            <p className="rg48-mini">No tickets yet.</p>
          ) : (
            <div className="tk-mine">
              {myTickets.map((t) => (
                <div key={t.id} className="tk-mine-row">
                  <b>{t.subject}</b>
                  <span className={`tk-status tk-${t.status}`}>{t.status}</span>
                  <span className="rg48-mini">{t.messages} {t.messages === 1 ? "message" : "messages"} · {new Date(t.updatedAt).toLocaleDateString("en-GB")}</span>
                </div>
              ))}
            </div>
          )}
        </section>
        {/* P1 Batch 2 (A23): notifications from your admin — in-app
            only. Unread ones are highlighted; tap to mark as read. */}
        <section className="ac-sec">
          <div className="ac-sec-head">
            <h3>Notifications</h3>
            {notifUnread > 0 ? <span className="ac-count">{notifUnread} unread</span> : null}
          </div>
          {myNotifs === null ? (
            <p>Loading notifications…</p>
          ) : myNotifs.length === 0 ? null : (
            <>
              {notifUnread > 0 ? (
                <p><button className="linklike" type="button" onClick={() => void markAllNotifsRead()}>Mark all as read</button></p>
              ) : null}
              <div className="ntf-list">
                {myNotifs.map((n) => (
                  <div key={n.id} className={`ntf-row${n.readAt ? "" : " ntf-unread"}`}>
                    <p><b>{n.title}</b></p>
                    <p>{n.body}</p>
                    <span className="rg48-mini">From {n.from} · {new Date(n.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    {n.readAt ? null : (
                      <button className="linklike" type="button" onClick={() => void markNotifRead(n.id)}>Mark as read</button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
        {/* P2 Batch 1 (A29): self-exclusion banner + Take a break. A
            break only ever EXTENDS a cool-off — it never shortens one,
            and a self-excluded player cannot take a break (they are
            already fully out). */}
        {myLimits?.selfExcludedUntil && new Date(myLimits.selfExcludedUntil).getTime() > Date.now() ? (
          <section className="ac-sec">
            <h3>Self-excluded</h3>
            <p className="pd-blocked-note">Self-excluded until {new Date(myLimits.selfExcludedUntil).toLocaleDateString("en-GB")}{myLimits.selfExclusionReason ? ` — ${myLimits.selfExclusionReason}` : ""}. You cannot deposit, play or settle until then. If you need this lifted early, contact your admin.</p>
          </section>
        ) : (
          <section className="ac-sec">
            <h3>Take a break</h3>
            <p className="rg48-sub">Set a cool-off for yourself — play is off until it ends. A break only ever extends a cool-off, never shortens one.</p>
            {myLimits?.coolOffUntil && new Date(myLimits.coolOffUntil).getTime() > Date.now() ? (
              <p className="pd-blocked-note">You are on a cool-off until {new Date(myLimits.coolOffUntil).toLocaleDateString("en-GB")} — play is off until then.</p>
            ) : null}
            <div className="money-chips" role="group" aria-label="Take a break for">
              <button type="button" disabled={breakBusy} onClick={() => void takeBreak(1)}>24 hours</button>
              <button type="button" disabled={breakBusy} onClick={() => void takeBreak(7)}>7 days</button>
              <button type="button" disabled={breakBusy} onClick={() => void takeBreak(30)}>30 days</button>
            </div>
            <p className="rg48-mini">Deposits still work during a cool-off — only play is blocked. Self-exclusion blocks both.</p>
          </section>
        )}
        <section className="ac-sec ac-session">
          <h3>Session</h3>
          <nav className="ac-menu" aria-label="Session">
            <Link className="ac-row" href="/settings">
              <span className="ac-row-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2" /><path d="M12 2.6v2.8M12 18.6v2.8M2.6 12h2.8M18.6 12h2.8M5.2 5.2l2 2M16.8 16.8l2 2M18.8 5.2l-2 2M7.2 16.8l-2 2" /></svg></span>
              <span className="ac-row-txt"><b>Settings</b><span>profile, password, preferences</span></span>
              <span className="ac-row-chev" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg></span>
            </Link>
            <Link className="ac-row" href="/wallet">
              <span className="ac-row-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18M16.5 14.5h.01" /></svg></span>
              <span className="ac-row-txt"><b>Wallet</b><span>balances and deposit</span></span>
              <span className="ac-row-chev" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg></span>
            </Link>
            {(user.role === "admin" || user.role === "owner") && (
              <Link className="ac-row" href="/admin">
                <span className="ac-row-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3l7 2.8v5.4c0 4.6-3 7.6-7 9.3-4-1.7-7-4.7-7-9.3V5.8L12 3z" /><path d="M9 11.5l2.2 2.2 4.3-4.2" /></svg></span>
                <span className="ac-row-txt"><b>Admin panel</b><span>players, referrals and commission</span></span>
                <span className="ac-row-chev" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg></span>
              </Link>
            )}
            {user.role === "owner" && (
              <Link className="ac-row" href="/owner">
                <span className="ac-row-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 8.5l3.4 2.8L12 5.5l4.6 5.8L20 8.5 18.4 17H5.6L4 8.5z" /><path d="M6.5 20h11" /></svg></span>
                <span className="ac-row-txt"><b>Owner panel</b><span>admins, users and platform settings</span></span>
                <span className="ac-row-chev" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg></span>
              </Link>
            )}
          </nav>
          <button className="ac-row ac-row-danger" type="button" onClick={() => void logout()}>
            <span className="ac-row-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M13 4H6v16h7" /><path d="M10 12h11M17.5 8.5L21 12l-3.5 3.5" /></svg></span>
            <span className="ac-row-txt"><b>Log out</b><span>sign out of your account</span></span>
          </button>
        </section>
      </div>
    </main>
  );
}
