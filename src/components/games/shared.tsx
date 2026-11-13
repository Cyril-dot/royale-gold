// Shared game-room shell + settle hook. Every room follows the v48
// standard pattern: Back coin button (icon-only, 48px, top-left), balance
// beside the title, subtitle under, stats strip + history, stake chips.
// Room headers are normal page flow — never sticky/fixed — so they
// scroll away. Balances update server-side via POST /api/games/settle;
// stats/history persist via /api/games/stats + /api/games/history.
// In SIM mode, cash games play against the session SIM counter only.

"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { api, fmtCash, fmtCoins, GameHistoryRow, GameStat, money } from "../../lib/api";
import { GameDef } from "../../lib/games";
import { playSfx, useStore } from "../../lib/store";

export interface SettleResult {
  payout: number;
  cash: number;
  coins: number;
  sim: number;
  xp: number;
  level: number;
}

export function useGameRoom(game: GameDef) {
  const { user, wallet, mode, muted, toast, setWallet, simSession, setSimSession, openAuth, refresh } = useStore();
  const [stats, setStats] = useState<GameStat | null>(null);
  const [history, setHistory] = useState<GameHistoryRow[]>([]);
  const [busy, setBusy] = useState(false);

  const loadStats = useCallback(async () => {
    if (!user) return;
    try {
      const s = await api<{ stats: GameStat[] }>("/api/games/stats");
      setStats(s.stats.find((x) => x.game === game.slug) || null);
      const h = await api<{ history: GameHistoryRow[] }>(`/api/games/history?limit=20`);
      setHistory(h.history.filter((x) => x.game === game.slug));
    } catch {
      /* ignore */
    }
  }, [user, game.slug]);

  useEffect(() => { void loadStats(); }, [loadStats]);

  const isCoin = game.currency === "coins";
  const simMode = mode === "SIM" && !isCoin;
  const balance = isCoin ? wallet?.coins ?? user?.coins ?? 0 : simMode ? simSession ?? wallet?.sim ?? 0 : wallet?.cash ?? user?.cash ?? 0;
  const balText = isCoin ? `${fmtCoins(balance)} coins` : simMode ? `SIM ${Math.round(balance).toLocaleString("en-GH")}` : fmtCash(balance);

  /** Settle one round. Returns true on success. */
  const settle = useCallback(async (stake: number, payout: number, result: Record<string, unknown> = {}, roundId?: string): Promise<boolean> => {
    if (!user) { openAuth("login"); return false; }
    stake = money(stake);
    payout = money(payout);
    if (stake <= 0) return false;
    if (balance < stake) { toast(`Not enough ${isCoin ? "coins" : simMode ? "SIM" : "cash"} — top up to play`, "lose"); return false; }
    setBusy(true);
    try {
      if (simMode) {
        // Demo SIM play: in-memory session counter only.
        setSimSession((simSession ?? 0) - stake + payout);
        const won = payout > stake;
        toast(won ? `You won ${fmtCash(payout)} (SIM)` : payout > 0 ? `${fmtCash(payout)} back (SIM)` : `You lost ${fmtCash(stake)} (SIM)`, won ? "win" : "lose");
        if (won) playSfx("cheer", muted); else playSfx("groan", muted);
        setHistory((h) => [{ id: `sim-${Date.now()}`, game: game.slug, currency: "cash", stake, payout, result, createdAt: new Date().toISOString() }, ...h].slice(0, 20));
        return true;
      }
      const r = await api<SettleResult>("/api/games/settle", {
        method: "POST",
        body: JSON.stringify({ game: game.slug, currency: game.currency, stake, payout, result, roundId: roundId || undefined }),
      });
      setWallet({ cash: r.cash, coins: r.coins, sim: r.sim });
      const won = payout > stake;
      const amt = isCoin ? `${fmtCoins(payout)} coins` : fmtCash(payout);
      toast(won ? `You won ${amt}` : payout > 0 ? `${amt} back` : isCoin ? `You lost ${fmtCoins(stake)} coins` : `You lost ${fmtCash(stake)}`, won ? "win" : "lose");
      if (won) playSfx("cheer", muted); else if (payout === 0) playSfx("groan", muted);
      await loadStats();
      return true;
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Settle failed", "lose");
      return false;
    } finally {
      setBusy(false);
    }
  }, [user, balance, isCoin, simMode, simSession, game.slug, toast, muted, setWallet, setSimSession, openAuth, loadStats]);

  /** Prepend a local history row (SIM rounds have no server row). */
  const pushHistory = useCallback((row: GameHistoryRow) => {
    setHistory((h) => [row, ...h].slice(0, 20));
  }, []);

  return { user, wallet, mode, muted, stats, history, busy, balance, balText, simMode, isCoin, settle, pushHistory, refreshStats: loadStats, refresh };
}

export function StakeChips({ stake, setStake, currency, disabled }: { stake: number; setStake: (n: number) => void; currency: "cash" | "coins"; disabled?: boolean }) {
  const chips = currency === "coins" ? [1, 5, 10] : [5, 10, 25];
  // Round 13: a typed stake input, first in the row, then the quick chips.
  // The typed value lives in local text state so the user can clear the
  // field mid-type (empty never commits) and "7." stays editable while
  // they type the decimals. Chips write through setStake and the effect
  // below re-syncs the text, so input and chips never disagree.
  const [text, setText] = useState(String(stake));
  useEffect(() => { setText(String(stake)); }, [stake]);

  const canonical = (raw: string): number | null => {
    if (raw.trim() === "") return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    let v = currency === "coins" ? Math.round(n) : Math.round(n * 100) / 100;
    if (v < 1) v = 1;
    return v;
  };
  const onChange = (raw: string) => {
    setText(raw);
    const v = canonical(raw);
    // Commit while typing only when the text is already the canonical
    // form — "7." would otherwise snap to "7" and the next digit lands
    // in the wrong place. Anything else (empty, "07", "2.5" coins)
    // waits for blur.
    if (v !== null && String(v) === raw) setStake(v);
  };
  const onBlur = () => {
    const v = canonical(text);
    if (v === null) { setStake(1); setText("1"); return; }
    setStake(v);
    setText(String(v));
  };

  return (
    <div className="stake-row" role="group" aria-label="Stake">
      <span className="stake-lab">Stake {currency === "coins" ? "coins" : "GH₵"}</span>
      <span className="stake-input">
        <span className="stake-cur" aria-hidden="true">{currency === "coins" ? "◉" : "GH₵"}</span>
        <input
          type="number"
          min={1}
          step={1}
          inputMode={currency === "coins" ? "numeric" : "decimal"}
          enterKeyHint="done"
          aria-label={currency === "coins" ? "Stake in coins" : "Stake in Ghana cedis"}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
        />
      </span>
      {chips.map((c) => (
        <button key={c} type="button" className="stake-chip" aria-pressed={stake === c} onClick={() => setStake(c)} disabled={disabled}>{c}</button>
      ))}
    </div>
  );
}

export function StatsStrip({ stats, currency }: { stats: GameStat | null; currency: "cash" | "coins" }) {
  const played = stats?.played ?? 0;
  const rate = played > 0 ? Math.round(((stats?.wins ?? 0) / played) * 100) + "%" : "—";
  const best = stats?.best ?? 0;
  return (
    <div className="xg-stats" aria-label="Game statistics">
      <div className="xg-stat"><b>{played}</b><span>PLAYED</span></div>
      <div className="xg-stat win"><b>{stats?.wins ?? 0}</b><span>WINS</span></div>
      <div className="xg-stat lose"><b>{stats?.losses ?? 0}</b><span>LOSSES</span></div>
      <div className="xg-stat"><b>{rate}</b><span>WIN RATE</span></div>
      <div className="xg-stat"><b>{stats?.streak ?? 0}</b><span>STREAK</span></div>
      <div className="xg-stat"><b>{currency === "coins" ? fmtCoins(best) : fmtCash(best)}</b><span>BEST</span></div>
    </div>
  );
}

export function HistoryList({ history, currency }: { history: GameHistoryRow[]; currency: "cash" | "coins" }) {
  return (
    <div className="xg-history">
      <span className="bh-lab">LAST ROUNDS</span>
      {history.length === 0 ? (
        <span className="bh-empty">No rounds yet — yours will land here.</span>
      ) : (
        history.map((h) => (
          <span key={h.id} className={`bh-item ${h.payout > h.stake ? "win" : h.payout > 0 ? "push" : "lose"}`} title={`${currency === "coins" ? `${h.stake} → ${h.payout} coins` : `${fmtCash(h.stake)} → ${fmtCash(h.payout)}`}`}>
            {h.payout > h.stake ? "W" : h.payout > 0 ? "=" : "L"}
          </span>
        ))
      )}
    </div>
  );
}

export function RoomShell({ game, subtitle, children, stats, history, bare }: {
  game: GameDef;
  subtitle: string;
  children: React.ReactNode;
  stats: GameStat | null;
  history: GameHistoryRow[];
  bare?: boolean;
}) {
  const { mode, setMode, muted, toggleMute, user, wallet, simSession, topUpSim } = useStore();
  const isCoin = game.currency === "coins";
  const simMode = mode === "SIM" && !isCoin;
  const balance = isCoin ? wallet?.coins ?? user?.coins ?? 0 : simMode ? simSession ?? wallet?.sim ?? 0 : wallet?.cash ?? user?.cash ?? 0;
  const balText = isCoin ? `${fmtCoins(balance)} coins` : simMode ? `SIM ${Math.round(balance).toLocaleString("en-GH")}` : fmtCash(balance);

  return (
    <div className="xgame-room">
      {/* Round 8: bare variant (homepage Bottle section) renders no
          xg-bar at all — no back link, no title, no balance, no REAL/SIM
          bar, no mute, no v48 pill. The homepage is not supposed to
          have those; the header already carries the mode switch. */}
      {!bare && (
      <div className="xg-bar">
        <div className="wrap xg-bar-in">
          <Link className="xg-back xg-back-icon" href="/games" aria-label="Back to all games">←</Link>
          <div className="xg-head">
            {/* Round 9: no game name in any room's top bar — the user
                wants the title gone from every game. The mode bar
                carries margin-left:auto, so it still sits at the right
                end of the bar, after the back coin. */}
            <div className="xg-mode">
              <span className="xg-bal">{balText}</span>
              {/* Round 12: SIM runs out mid-session with no way back —
                  the top-up lives next to the balance, where the
                  "Not enough SIM — top up to play" toast fires. */}
              {simMode && (
                <button type="button" className="xg-topup" onClick={topUpSim}>Top up SIM</button>
              )}
              {!isCoin && (
                <span className="xg-mode-btns" role="group" aria-label="Real or demo cash">
                  <button type="button" aria-pressed={mode === "REAL"} className={mode === "REAL" ? "on" : ""} onClick={() => setMode("REAL")}>REAL</button>
                  <button type="button" aria-pressed={mode === "SIM"} className={mode === "SIM" ? "on" : ""} onClick={() => setMode("SIM")}>SIM</button>
                </span>
              )}
              <button className="icon-btn xg-mute" type="button" aria-label={muted ? "Unmute" : "Mute"} onClick={toggleMute}>
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4z" />{muted ? <path stroke="#E5322D" strokeWidth="2.4" strokeLinecap="round" d="M16.5 9.5l5 5M21.5 9.5l-5 5" /> : <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M16 9.5a3.4 3.4 0 0 1 0 5M18.4 7a6.6 6.6 0 0 1 0 10" />}</svg>
              </button>
            </div>
          </div>
        </div>
        <span className="xg-ver" aria-hidden="true">v48</span>
      </div>
      )}
      <div className="wrap">
        <p className="xg-sub">{subtitle}</p>
        {children}
        <StatsStrip stats={stats} currency={game.currency} />
        <HistoryList history={history} currency={game.currency} />
        <p className="xg-note">Play again from the result — every round settles server-side.</p>
      </div>
    </div>
  );
}

export function fmtMult(m: number) { return "×" + m.toFixed(2); }
