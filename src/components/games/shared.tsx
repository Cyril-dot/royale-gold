// Shared game-room shell + settle hook. Every room follows the v48
// standard pattern: GameRoomHeader on top (round 21 — back, the cash
// balance AND the coins balance, REAL/SIM toggle, mute), subtitle
// under, stats strip + history, stake chips. Room headers are normal
// page flow — never sticky/fixed — so they scroll away. Balances
// update server-side via POST /api/games/settle; stats/history persist
// via /api/games/stats + /api/games/history.
// In SIM mode, cash games play against the session SIM counter only.

"use client";

import React, { useCallback, useEffect, useState } from "react";
import { api, fmtCash, fmtCoins, GameHistoryRow, GameStat, money } from "../../lib/api";
import { GameDef } from "../../lib/games";
import GameRoomHeader from "../GameRoomHeader";
import { playSfx, useStore } from "../../lib/store";

export interface SettleResult {
  payout: number;
  cash: number;
  coins: number;
  sim: number;
  xp: number;
  level: number;
}

// ---- Shared win confetti (Round 31) ----
// Gold confetti rain on every win. Fired from settle() — the shared
// win path, so every game gets it — via a window event, so a room
// never has to pass a prop: RoomShell renders the layer, settle()
// fires the event. Pieces are plain divs animated by one CSS
// keyframe (transform only); a burst removes itself after the
// longest fall. Reduced motion = no confetti at all (checked here
// and again in CSS, so a stale event can never show a burst).

const CONFETTI_COLORS = ["#F2C230", "#FFF6D8", "#3ED97E", "#C98F12"];

export function fireConfetti() {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  window.dispatchEvent(new CustomEvent("rg-confetti"));
}

interface ConfettiPiece { left: number; delay: number; dur: number; size: number; color: string; rot: number; round: boolean }
interface ConfettiBurst { id: number; pieces: ConfettiPiece[] }

function makeBurst(id: number): ConfettiBurst {
  const pieces: ConfettiPiece[] = [];
  for (let i = 0; i < 36; i++) {
    pieces.push({
      left: Math.random() * 100,
      delay: Math.random() * 0.35,
      dur: 1.8 + Math.random() * 1.0,
      size: 6 + Math.random() * 6,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      rot: 360 + Math.random() * 540,
      round: Math.random() < 0.25,
    });
  }
  return { id, pieces };
}

export function ConfettiLayer() {
  const [bursts, setBursts] = useState<ConfettiBurst[]>([]);
  useEffect(() => {
    let id = 0;
    const onBurst = () => {
      const burst = makeBurst(++id);
      setBursts((b) => [...b, burst]);
      // Longest fall is 0.35s delay + 2.8s duration — clear after 3.4s.
      setTimeout(() => setBursts((b) => b.filter((x) => x.id !== burst.id)), 3400);
    };
    window.addEventListener("rg-confetti", onBurst);
    return () => window.removeEventListener("rg-confetti", onBurst);
  }, []);
  if (bursts.length === 0) return null;
  return (
    <div className="rg-confetti" aria-hidden="true">
      {bursts.flatMap((burst) =>
        burst.pieces.map((p, i) => (
          <i key={`${burst.id}-${i}`} style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.round ? p.size : p.size * 1.5,
            background: p.color,
            borderRadius: p.round ? "50%" : 2,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
            "--rot": `${p.rot}deg`,
          } as React.CSSProperties} />
        ))
      )}
    </div>
  );
}

export function useGameRoom(game: GameDef) {
  const { user, wallet, mode, muted, toast, setWallet, simSession, setSimSession, openAuth, refresh } = useStore();
  const [stats, setStats] = useState<GameStat | null>(null);
  const [history, setHistory] = useState<GameHistoryRow[]>([]);
  const [busy, setBusy] = useState(false);
  // SIM-mode stats: the server only records REAL rounds, so SIM rounds
  // never moved the stats strip (PLAYED stayed 0 while playing SIM).
  // Mirror the server /api/games/stats definition locally, persisted
  // per game in localStorage so SIM counts are cumulative like REAL.
  const [simStats, setSimStats] = useState<GameStat | null>(null);

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

  // Load this game's persisted SIM stats when SIM mode is on.
  useEffect(() => {
    if (!simMode) return;
    try {
      const all = JSON.parse(localStorage.getItem("rg-sim-stats") || "{}") as Record<string, GameStat>;
      setSimStats(all[game.slug] ?? null);
    } catch { /* ignore */ }
  }, [game.slug, simMode]);

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
        if (won) { playSfx("cheer", muted); fireConfetti(); } else playSfx("groan", muted);
        // SIM stats: same definition as the server (/api/games/stats) —
        // played+1, win iff payout > stake, best = max profit, streak =
        // the current run of consecutive wins. Persisted per game.
        const profit = payout - stake;
        setSimStats((prev) => {
          const p = prev ?? { game: game.slug, played: 0, wins: 0, losses: 0, streak: 0, best: 0 };
          const next: GameStat = {
            game: game.slug,
            played: p.played + 1,
            wins: p.wins + (won ? 1 : 0),
            losses: p.losses + (won ? 0 : 1),
            streak: won ? p.streak + 1 : 0,
            best: Math.max(p.best, profit),
          };
          try {
            const all = JSON.parse(localStorage.getItem("rg-sim-stats") || "{}") as Record<string, GameStat>;
            all[game.slug] = next;
            localStorage.setItem("rg-sim-stats", JSON.stringify(all));
          } catch { /* ignore */ }
          return next;
        });
        setHistory((h) => [{ id: `sim-${Date.now()}`, game: game.slug, currency: "cash", stake, payout, result, createdAt: new Date().toISOString() }, ...h].slice(0, 20));
        return true;
      }
      const r = await api<SettleResult>("/api/games/settle", {
        method: "POST",
        body: JSON.stringify({ game: game.slug, currency: game.currency, stake, payout, result, roundId: roundId || undefined }),
      });
      setWallet({ cash: r.cash, coins: r.coins, sim: r.sim });
      // P0 Batch 2 (O10): the toast shows the EFFECTIVE payout the
      // server settled — equal to the requested one unless the owner's
      // per-game max-payout cap cut it down. Tetris can also bank coins
      // mid-round (result.banked); the toast counts those too, so a
      // fully-banked round reads as a win, not a loss.
      const effPayout = typeof r.payout === "number" ? r.payout : payout;
      const banked = typeof result.banked === "number" ? result.banked : 0;
      const totalWon = effPayout + banked;
      const won = totalWon > stake;
      const amt = isCoin ? `${fmtCoins(totalWon)} coins` : fmtCash(totalWon);
      toast(won ? `You won ${amt}` : totalWon > 0 ? `${amt} back` : isCoin ? `You lost ${fmtCoins(stake)} coins` : `You lost ${fmtCash(stake)}`, won ? "win" : "lose");
      if (won) { playSfx("cheer", muted); fireConfetti(); } else if (totalWon === 0) playSfx("groan", muted);
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

  // In SIM mode the strip shows the local SIM stats (the server only
  // records REAL rounds); in REAL mode it shows the server stats.
  const displayStats: GameStat | null = simMode
    ? simStats ?? { game: game.slug, played: 0, wins: 0, losses: 0, streak: 0, best: 0 }
    : stats;
  return { user, wallet, mode, muted, stats: displayStats, history, busy, balance, balText, simMode, isCoin, settle, pushHistory, refreshStats: loadStats, refresh };
}

export function StakeChips({ stake, setStake, currency, disabled }: { stake: number; setStake: (n: number) => void; currency: "cash" | "coins"; disabled?: boolean }) {
  // Round 13: a typed stake input. Round 13 follow-up: the quick-amount
  // chips are GONE (user's order — the input is the only stake control).
  // The typed value lives in local text state so the user can clear the
  // field mid-type (empty never commits) and "7." stays editable while
  // they type the decimals. The effect below re-syncs the text when the
  // stake changes from elsewhere, so input and state never disagree.
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
  // Round 21: the header (balances, mode, mute) lives in
  // GameRoomHeader now — RoomShell only renders the subtitle, the
  // game, the stats strip and the history.
  return (
    <div className="xgame-room">
      {/* Shared win confetti — the layer lives in every room; settle()
          fires it on a win. pointer-events:none, so it never blocks a tap. */}
      <ConfettiLayer />
      {!bare && <GameRoomHeader />}
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
