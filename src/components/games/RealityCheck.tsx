// Reality check (P2 Batch 1, A29) — a session summary modal that
// appears in a game room every N minutes, when the player has a
// reality check set (realityCheckMinutes > 0). No new session-tracking
// table: the "session" is the rounds since this room was entered, read
// from the existing /api/games/history endpoint, and the room-entry
// time is kept in memory here. Dismissible — it shows again at the
// next interval. "Take a break" sends the player to /account, where
// the cool-off buttons live.

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useStore } from "../../lib/store";
import { api, fmtMoney, type GameHistoryRow } from "../../lib/api";

interface SessionStats {
  minutes: number;
  cashStaked: number;
  cashWon: number;
  coinsStaked: number;
  coinsWon: number;
  rounds: number;
}

export default function RealityCheck() {
  const { user } = useStore();
  const [minutes, setMinutes] = useState(0);
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const enteredAt = useRef<number | null>(null);
  const shownCount = useRef(0);

  // The room-entry time is set on mount, client-side only — reading
  // Date.now() in the ref initializer breaks the production prerender
  // of /games/[slug] (the value would be baked at build time).
  useEffect(() => {
    enteredAt.current = Date.now();
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api<{ limits: { realityCheckMinutes: number } }>("/api/player/limits")
      .then((r) => { if (!cancelled) setMinutes(r.limits.realityCheckMinutes || 0); })
      .catch(() => { if (!cancelled) setMinutes(0); });
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!user || minutes <= 0) return;
    const tick = async () => {
      const start = enteredAt.current;
      if (start == null) return;
      const elapsed = Date.now() - start;
      const intervals = Math.floor(elapsed / (minutes * 60_000));
      if (intervals <= shownCount.current) return;
      shownCount.current = intervals;
      try {
        const r = await api<{ history: GameHistoryRow[] }>("/api/games/history?limit=100");
        const rows = (r.history ?? []).filter((h) => new Date(h.createdAt).getTime() >= start);
        let cashStaked = 0;
        let cashWon = 0;
        let coinsStaked = 0;
        let coinsWon = 0;
        for (const h of rows) {
          if (h.currency === "coins") { coinsStaked += h.stake; coinsWon += h.payout; }
          else { cashStaked += h.stake; cashWon += h.payout; }
        }
        setStats({ minutes: Math.round(elapsed / 60_000), cashStaked, cashWon, coinsStaked, coinsWon, rounds: rows.length });
        setOpen(true);
      } catch { /* the room keeps working without the summary */ }
    };
    const t = setInterval(() => { void tick(); }, 10_000);
    return () => clearInterval(t);
  }, [user, minutes]);

  if (!open || !stats) return null;

  const cashNet = stats.cashWon - stats.cashStaked;
  const coinsNet = stats.coinsWon - stats.coinsStaked;

  return (
    <div className="rc-overlay" role="dialog" aria-modal="true" aria-label="Reality check">
      <div className="rc-modal">
        <h3>Reality check</h3>
        <p>You have been playing for <b>{stats.minutes} min</b> in this room.</p>
        <div className="sum-cards">
          <div className="sum-card"><span>Rounds</span><b>{stats.rounds}</b></div>
          <div className="sum-card"><span>Cash staked</span><b>{fmtMoney(stats.cashStaked, user?.currency ?? "GHS")}</b></div>
          <div className="sum-card"><span>Cash won</span><b>{fmtMoney(stats.cashWon, user?.currency ?? "GHS")}</b></div>
          <div className="sum-card"><span>Cash net</span><b>{cashNet >= 0 ? `+${fmtMoney(cashNet, user?.currency ?? "GHS")}` : fmtMoney(cashNet, user?.currency ?? "GHS")}</b></div>
          <div className="sum-card"><span>Coins staked</span><b>{stats.coinsStaked}</b></div>
          <div className="sum-card"><span>Coins net</span><b>{coinsNet >= 0 ? `+${coinsNet}` : `${coinsNet}`}</b></div>
        </div>
        <p className="rg48-mini">This is your session so far — since you opened this game room. It shows again every {minutes} min while you play.</p>
        <div className="rc-actions">
          <button className="btn btn-gold" type="button" onClick={() => setOpen(false)}>Continue playing</button>
          <Link className="btn btn-ghost" href="/account">Take a break</Link>
        </div>
      </div>
    </div>
  );
}
