// Mines — 5×5, 3/5/10 mines, combinatoric multipliers with 3% edge:
// mult(k) = floor(C(25,k) / C(25-m,k) × 0.97 × 100) / 100 (v48, exact).
// Restored vs the artifact: the gem/mine are the artifact's SVGs (the
// port showed ◆/● text and its "gem" class had no CSS at all, so a
// revealed gem looked identical to a hidden tile); a mine hit and a
// cash-out reveal the WHOLE board (safe tiles dimmed, hit mine
// undimmed); finding every safe tile auto-cashes at the full
// multiplier; the per-gem and mine-count messages are the artifact's.

"use client";

import { useState } from "react";
import { fmtMoney } from "../../lib/api";
import { GameDef } from "../../lib/games";
import { RoomShell, StakeChips, useGameRoom } from "./shared";
import { playSfx } from "../../lib/store";

function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}
function multFor(k: number, mines: number) {
  if (k <= 0) return 1;
  return Math.floor((comb(25, k) / comb(25 - mines, k)) * 0.97 * 100) / 100;
}

const GEM_SVG = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <defs>
      <radialGradient id="mn-gem-g" cx="35%" cy="28%" r="85%">
        <stop offset="0%" stopColor="#FFF6C8" />
        <stop offset="45%" stopColor="#F2C230" />
        <stop offset="100%" stopColor="#8A6508" />
      </radialGradient>
      <linearGradient id="mn-gem-f" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FFFFFF" stopOpacity=".9" />
        <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
      </linearGradient>
    </defs>
    <ellipse cx="12" cy="20.6" rx="6.4" ry="1.5" fill="rgba(0,0,0,.35)" />
    <path d="M6.2 3.5h11.6L21 9.2 12 20.5 3 9.2z" fill="url(#mn-gem-g)" stroke="#7A5800" strokeWidth="1.3" />
    <path d="M3 9.2h18M12 20.5L8.6 9.2l2-5.7M12 20.5L15.4 9.2l-2-5.7" fill="none" stroke="#8A6508" strokeWidth="1" />
    <path d="M7 4.2h4l-1.4 4.2H8.2z" fill="url(#mn-gem-f)" opacity=".8" />
  </svg>
);
const MINE_SVG = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <defs>
      <radialGradient id="mn-mine-g" cx="38%" cy="32%" r="80%">
        <stop offset="0%" stopColor="#6B7488" />
        <stop offset="50%" stopColor="#232838" />
        <stop offset="100%" stopColor="#05060A" />
      </radialGradient>
    </defs>
    <path d="M12 2.5v3M4.8 5.8l2.1 2.1M19.2 5.8l-2.1 2.1" stroke="#F2C230" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="12" cy="13.5" r="6.8" fill="url(#mn-mine-g)" stroke="#000" strokeWidth="1.4" />
    <ellipse cx="9.8" cy="10.8" rx="2.3" ry="1.5" fill="rgba(255,255,255,.45)" transform="rotate(-24 9.8 10.8)" />
    <circle cx="12" cy="13.5" r="6.8" fill="none" stroke="rgba(255,255,255,.16)" strokeWidth=".7" />
    <path d="M12 5.5c.8-1.6 2.2-2 3.4-1.6-.4 1.2-1.4 2-2.7 2.1" fill="#FF9E2C" />
  </svg>
);
const IDLE_SVG = (
  <svg className="mn-ico-idle" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.2 3.5h11.6L21 9.2 12 20.5 3 9.2z" fill="none" stroke="#FFF6D8" strokeWidth="1.4" /></svg>
);

type Tile = "hidden" | "safe" | "mine" | "boom" | "safe-dim" | "mine-dim";

export default function MinesRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(25);
  const [mineCount, setMineCount] = useState(3);
  const [playing, setPlaying] = useState(false);
  const [tiles, setTiles] = useState<Tile[]>(Array(25).fill("hidden"));
  const [mineSet, setMineSet] = useState<Set<number>>(new Set());
  const [revealed, setRevealed] = useState(0);
  const [msg, setMsg] = useState("Pick your mines and stake, start the round, then tap tiles. Every gem raises the multiplier — cash out before a mine finds you.");

  // The combinatoric multiplier is uncapped by itself (5 mines at
  // 19 gems is ×8,589) — clamp every displayed and settled value at
  // the catalogue ceiling (×5,000), or the server rejects the
  // cash-out outright and a cleared board pays nothing.
  const multAt = (k: number, mines: number = mineCount) => Math.min(multFor(k, mines), game.maxMultiplier);
  const mult = multAt(revealed);
  const pays = Math.round(stake * mult * 100) / 100;

  const start = () => {
    if (room.balance < stake) { setMsg("Balance too low for that stake."); return; }
    const mines = new Set<number>();
    while (mines.size < mineCount) mines.add(Math.floor(Math.random() * 25));
    setMineSet(mines);
    setTiles(Array(25).fill("hidden"));
    setRevealed(0);
    setPlaying(true);
    setMsg(`${mineCount} mines hidden. Tap a tile — the first gem already pays ×${multAt(1).toFixed(2)}.`);
  };

  // Reveal the whole board: safe tiles dimmed as gems, mines shown,
  // the hit mine undimmed. The port only lit the mines up.
  const revealAll = (hitIdx: number | null, tilesNow: Tile[]) => {
    const t = [...tilesNow];
    for (let i = 0; i < 25; i++) {
      if (t[i] !== "hidden") continue;
      t[i] = mineSet.has(i) ? "mine-dim" : "safe-dim";
    }
    if (hitIdx !== null) t[hitIdx] = "boom";
    setTiles(t);
  };

  const reveal = async (i: number) => {
    if (!playing || tiles[i] !== "hidden") return;
    if (mineSet.has(i)) {
      const t = [...tiles];
      t[i] = "boom";
      setTiles(t);
      revealAll(i, t);
      setPlaying(false);
      setMsg("BOOM — a mine. The stake is gone.");
      // Impact thud at the hit; the settle below adds the lose groan.
      playSfx("boom", room.muted);
      await room.settle(stake, 0, { mines: mineCount, revealed });
      return;
    }
    const t = [...tiles];
    t[i] = "safe";
    setTiles(t);
    const r = revealed + 1;
    setRevealed(r);
    // Bright pop per gem — each reveal feels like a small win.
    playSfx("pop", room.muted);
    if (r >= 25 - mineCount) {
      // Every safe tile found — auto-cash at the full multiplier.
      const m = multAt(r);
      const pay = Math.round(stake * m * 100) / 100;
      revealAll(null, t);
      setPlaying(false);
      // Capped-win display: the win line states the credited amount.
      const res = await room.settle(stake, pay, { mines: mineCount, revealed: r });
      if (!res) { setMsg("The board is cleared, but the auto cash-out didn't go through — your stake is untouched. Start a new round to play again."); return; }
      const eff = res.payout;
      setMsg(`Every safe tile found! ${r} gems at ×${m.toFixed(2)}: ${fmtMoney(eff, room.user?.currency ?? "GHS")}${eff > stake ? " to your balance." : " back."}`);
      return;
    }
    setMsg(`Gem ${r} — ×${multAt(r).toFixed(2)} (${fmtMoney(Math.round(stake * multAt(r) * 100) / 100, room.user?.currency ?? "GHS")}). Next gem pays ×${multAt(r + 1).toFixed(2)} — cash out or keep digging?`);
  };

  const cashOut = async () => {
    if (!playing || revealed === 0) return;
    revealAll(null, tiles);
    setPlaying(false);
    // Capped-win display: the cash-out line states the credited amount.
    const res = await room.settle(stake, pays, { mines: mineCount, revealed });
    if (!res) { setPlaying(true); setMsg("Cash-out didn't go through — nothing was taken. Tap Cash out again."); return; }
    const eff = res.payout;
    setMsg(`Cashed out — ${revealed} gems at ×${mult.toFixed(2)}: ${fmtMoney(eff, room.user?.currency ?? "GHS")}${eff > stake ? "." : " back."}`);
  };

  const tileClass = (t: Tile) =>
    t === "safe" ? " safe" : t === "safe-dim" ? " safe dim" : t === "boom" ? " mine boom" : t === "mine-dim" ? " mine dim" : t === "mine" ? " mine" : "";
  const tileIcon = (t: Tile) =>
    t === "safe" || t === "safe-dim" ? GEM_SVG : t === "mine" || t === "mine-dim" || t === "boom" ? MINE_SVG : IDLE_SVG;

  return (
    <RoomShell game={game} subtitle="5×5 board · 3, 5 or 10 mines · every gem raises the multiplier" stats={room.stats} history={room.history}>
      <div className="mn-stage">
        <div className="xg-hud mn-hud">
          <span className="xg-chip" aria-label={`Multiplier ×${mult.toFixed(2)}`}><b>×{mult.toFixed(2)}</b></span>
          <span className="xg-chip" aria-label={`Gems found: ${revealed}`}><b>{revealed}</b></span>
          <span className="xg-chip push">CASH OUT <b>{playing && revealed > 0 ? fmtMoney(pays, room.user?.currency ?? "GHS") : fmtMoney(0, room.user?.currency ?? "GHS")}</b></span>
        </div>
        <div className="mn-board" role="grid" aria-label="Mines board, 5 by 5">
          {tiles.map((t, i) => (
            <button key={i} type="button" className={`mn-tile${tileClass(t)}`} onClick={() => void reveal(i)} disabled={!playing || t !== "hidden"} aria-label={`Tile ${i + 1}`}>
              {tileIcon(t)}
            </button>
          ))}
        </div>
      </div>
      <div className="xg-controls">
        <div className="xg-pickrow" role="group" aria-label="Mine count">
          {[3, 5, 10].map((m) => (
            <button key={m} type="button" className="xg-pick" aria-pressed={mineCount === m} onClick={() => { setMineCount(m); setMsg(`${m} mines — first gem pays ×${multAt(1, m).toFixed(2)}, and it climbs fast. Start when you're ready.`); }} disabled={playing}>
              <span className="xg-pick-txt">{m} mines</span>
            </button>
          ))}
        </div>
        <StakeChips stake={stake} setStake={setStake} currency="cash" disabled={playing} />
        {!playing && <button className="btn btn-gold xg-action" type="button" onClick={start}>Start round</button>}
        {playing && <button className="btn btn-gold xg-action mn-cash" type="button" onClick={() => void cashOut()} disabled={revealed === 0}>Cash out {revealed > 0 ? fmtMoney(pays, room.user?.currency ?? "GHS") : ""}</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}
