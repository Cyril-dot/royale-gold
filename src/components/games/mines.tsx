// Mines — 5×5, 3/5/10 mines, combinatoric multipliers with 3% edge:
// mult(k) = floor(C(25,k) / C(25-m,k) × 0.97 × 100) / 100 (v48, exact).

"use client";

import { useState } from "react";
import { fmtCash } from "../../lib/api";
import { GameDef } from "../../lib/games";
import { RoomShell, StakeChips, useGameRoom } from "./shared";

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

type Tile = "hidden" | "gem" | "mine" | "revealed-mine";

export default function MinesRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(25);
  const [mineCount, setMineCount] = useState(3);
  const [playing, setPlaying] = useState(false);
  const [tiles, setTiles] = useState<Tile[]>(Array(25).fill("hidden"));
  const [mineSet, setMineSet] = useState<Set<number>>(new Set());
  const [revealed, setRevealed] = useState(0);
  const [msg, setMsg] = useState("Pick your mines and stake, start the round, then tap tiles. Every gem raises the multiplier — cash out before a mine finds you.");

  const mult = multFor(revealed, mineCount);
  const pays = Math.round(stake * mult * 100) / 100;

  const start = () => {
    if (room.balance < stake) { setMsg("Balance too low for that stake."); return; }
    const mines = new Set<number>();
    while (mines.size < mineCount) mines.add(Math.floor(Math.random() * 25));
    setMineSet(mines);
    setTiles(Array(25).fill("hidden"));
    setRevealed(0);
    setPlaying(true);
    setMsg("Tap tiles to reveal gems — cash out before a mine finds you.");
  };

  const reveal = async (i: number) => {
    if (!playing || tiles[i] !== "hidden") return;
    if (mineSet.has(i)) {
      const t = [...tiles];
      mineSet.forEach((m) => { t[m] = m === i ? "revealed-mine" : "mine"; });
      setTiles(t);
      setPlaying(false);
      setMsg("BOOM — a mine. The stake is gone.");
      await room.settle(stake, 0, { mines: mineCount, revealed });
      return;
    }
    const t = [...tiles];
    t[i] = "gem";
    setTiles(t);
    setRevealed(revealed + 1);
  };

  const cashOut = async () => {
    if (!playing || revealed === 0) return;
    setPlaying(false);
    setMsg(`Cashed out at ×${mult.toFixed(2)} — ${fmtCash(pays)}.`);
    await room.settle(stake, pays, { mines: mineCount, revealed });
  };

  return (
    <RoomShell game={game} subtitle="5×5 board · 3, 5 or 10 mines · every gem raises the multiplier" stats={room.stats} history={room.history}>
      <div className="mn-stage">
        <div className="xg-hud mn-hud">
          <span className="xg-chip">MULTIPLIER <b>×{mult.toFixed(2)}</b></span>
          <span className="xg-chip">GEMS <b>{revealed}</b></span>
          <span className="xg-chip push">CASH OUT <b>{playing && revealed > 0 ? fmtCash(pays) : fmtCash(0)}</b></span>
        </div>
        <div className="mn-board" role="grid" aria-label="Mines board, 5 by 5">
          {tiles.map((t, i) => (
            <button key={i} type="button" className={`mn-tile${t === "gem" ? " gem" : t === "mine" ? " mine" : t === "revealed-mine" ? " boom" : ""}`} onClick={() => void reveal(i)} disabled={!playing} aria-label={`Tile ${i + 1}`}>
              {t === "gem" ? "◆" : t === "mine" || t === "revealed-mine" ? "●" : (
                <svg className="mn-ico-idle" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.2 3.5h11.6L21 9.2 12 20.5 3 9.2z" fill="none" stroke="#FFF6D8" strokeWidth="1.4" /></svg>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="xg-controls">
        <div className="xg-pickrow" role="group" aria-label="Mine count">
          {[3, 5, 10].map((m) => (
            <button key={m} type="button" className="xg-pick" aria-pressed={mineCount === m} onClick={() => setMineCount(m)} disabled={playing}>
              <span className="xg-pick-txt">{m} mines<small>{m === 3 ? "gentler multipliers" : m === 5 ? "balanced" : "big multipliers"}</small></span>
            </button>
          ))}
        </div>
        <StakeChips stake={stake} setStake={setStake} currency="cash" disabled={playing} />
        {!playing && <button className="btn btn-gold xg-action" type="button" onClick={start}>Start round</button>}
        {playing && <button className="btn btn-gold xg-action mn-cash" type="button" onClick={() => void cashOut()} disabled={revealed === 0}>Cash out {revealed > 0 ? fmtCash(pays) : ""}</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}
