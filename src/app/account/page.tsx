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
import { api, fmtCash, fmtCoins, GameStat, GameHistoryRow } from "../../lib/api";
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
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [claimBusy, setClaimBusy] = useState(false);

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
    return [
      { id: "win", name: "First Win", desc: "Win your first game", icon: BADGE_ICONS.win, unlocked: t.wins >= 1, progress: `${Math.min(t.wins, 1)}/1` },
      { id: "games", name: "Warming Up", desc: "Play 10 games", icon: BADGE_ICONS.games, unlocked: t.played >= 10, progress: `${Math.min(t.played, 10)}/10` },
      { id: "grind", name: "Grinder", desc: "Play 50 games", icon: BADGE_ICONS.grind, unlocked: t.played >= 50, progress: `${Math.min(t.played, 50)}/50` },
      { id: "streak", name: "Hot Streak", desc: "Win 5 in a row", icon: BADGE_ICONS.streak, unlocked: t.streak >= 5, progress: `${Math.min(t.streak, 5)}/5` },
      { id: "big", name: "Big Win", desc: "Best win GH₵ 100+", icon: BADGE_ICONS.big, unlocked: t.bestCash >= 100, progress: `GH₵ ${Math.round(Math.min(t.bestCash, 100))} / 100` },
      { id: "roller", name: "High Roller", desc: "Wager GH₵ 1,000+", icon: BADGE_ICONS.roller, unlocked: cashFlow.wagered >= 1000, progress: `GH₵ ${Math.round(Math.min(cashFlow.wagered, 1000))} / 1,000` },
    ];
  }, [realTotals, cashFlow]);

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
          <Link className="ac-wcard" href="/wallet"><span>CASH</span><b>{Number(cash).toFixed(2)}</b><i>Wallet →</i></Link>
          <Link className="ac-wcard" href="/wallet"><span>COINS</span><b>{fmtCoins(coins)}</b><i>Wallet →</i></Link>
          <Link className="ac-wcard" href="/wallet"><span>SIM</span><b>{fmtCoins(sim)}</b><i>Wallet →</i></Link>
        </section>
        <p className="rg48-mini">Coins are play-only — never withdrawable.</p>

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
              <div className="ac-stat"><span>BEST CASH WIN</span><b className="gold">{fmtCash(active.bestCash)}</b></div>
              {active.bestCoins > 0 && <div className="ac-stat"><span>BEST COIN WIN</span><b className="gold">{fmtCoins(active.bestCoins)} coins</b></div>}
              {tab === "REAL" && (
                <>
                  <div className="ac-stat"><span>WAGERED</span><b>{fmtCash(cashFlow.wagered)}</b></div>
                  <div className="ac-stat"><span>WON BACK</span><b className={cashFlow.net >= 0 ? "gold" : "red"}>{fmtCash(cashFlow.won)}</b></div>
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
                const best = g?.currency === "coins" ? `${fmtCoins(s.best)} coins` : fmtCash(s.best);
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
                const amt = h.currency === "coins" ? `${net > 0 ? "+" : "−"}${fmtCoins(Math.abs(net))} coins` : `${net > 0 ? "+" : "−"}${fmtCash(Math.abs(net))}`;
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
        <section className="ac-sec">
          <h3>Daily bonus</h3>
          <button className="btn btn-gold" type="button" onClick={() => void claimCoins()} disabled={claimBusy}>{claimBusy ? "Claiming…" : "Claim daily +5 coins"}</button>
        </section>
        <section className="ac-sec">
          <h3>Session</h3>
          <p><Link className="linklike" href="/settings">Settings — profile, password, preferences →</Link></p>
          <p><Link className="linklike" href="/wallet">Wallet — balances and deposit →</Link></p>
          {(user.role === "admin" || user.role === "owner") && <p><Link className="linklike" href="/admin">Open admin panel →</Link></p>}
          {user.role === "owner" && <p><Link className="linklike" href="/owner">Open owner panel →</Link></p>}
          <button className="btn btn-ghost" type="button" onClick={() => void logout()}>Log out</button>
        </section>
      </div>
    </main>
  );
}
