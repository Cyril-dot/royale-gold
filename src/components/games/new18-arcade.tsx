// Round 18 — arcade games: Tower Climb, Golden Catch, Gold Rush Derby.
// Tower Climb: pick a safe tile row by row and climb the ladder, cash
// out any time. Golden Catch: 30 seconds of tapping fish in the pond,
// the pot is your multiplier. Gold Rush Derby: pick one of four horses
// and watch the race — your horse first pays ×4.
// Refs: Wolfbet/Turbo Games Towers (tower climb rules + ladders),
// stt888/Fishing-game (fishing game feel),
// fkitsantas/Horse-Racing-Game-JavaScript (horse race animation).

"use client";

import { useEffect, useRef, useState } from "react";
import { fmtMoney } from "../../lib/api";
import { GameDef } from "../../lib/games";
import { playSfx } from "../../lib/store";
import { RoomShell, StakeChips, useGameRoom } from "./shared";

// --- Drawn art (no emoji): tower tile marks, fish, rod, horse, flag ---
function TileMark({ kind }: { kind: "gem" | "check" | "burst" }) {
  if (kind === "check") return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="v18-tmark"><path d="M4 12.5 L10 18.5 L20 5.5" fill="none" stroke="#231600" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
  );
  if (kind === "burst") return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="v18-tmark"><path d="M12 1 L14.5 8.5 L22 9 L16.5 14 L18.5 22 L12 17.5 L5.5 22 L7.5 14 L2 9 L9.5 8.5 Z" fill="#FFF6D8" stroke="#7A0F0F" strokeWidth="1.2" strokeLinejoin="round" /><circle cx="12" cy="12" r="2.4" fill="#E5322D" /></svg>
  );
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="v18-tmark"><path d="M12 3 L18 12 L12 21 L6 12 Z" fill="none" stroke="#F2C230" strokeWidth="2" strokeLinejoin="round" /><path d="M12 7 L15 12 L12 17 L9 12 Z" fill="#F2C230" opacity=".8" /></svg>
  );
}

function FishArt({ kind, size }: { kind: "minnow" | "clown" | "puffer" | "koi"; size: number }) {
  if (kind === "puffer") return (
    <svg viewBox="0 0 64 48" width={size} height={size * 0.75} aria-hidden="true" className="v18-fishart">
      <defs><radialGradient id="pf-b" cx=".4" cy=".35" r=".9"><stop offset="0" stopColor="#FFE9A8" /><stop offset=".55" stopColor="#F2C230" /><stop offset="1" stopColor="#B8860B" /></radialGradient></defs>
      <path className="v18-tail" d="M15 24 L5 17 L8 24 L5 31 Z" fill="#D9A41C" stroke="#7A5200" strokeWidth="1" strokeLinejoin="round" />
      <g fill="#8A6D1B" stroke="#FFE9A8" strokeWidth="0.7" strokeLinejoin="round"><path d="M32 4 L35 14 L29 14 Z" /><path d="M32 44 L35 34 L29 34 Z" /><path d="M58 24 L48 21 L48 27 Z" /><path d="M16 10 L22 16 L18 18 Z" /><path d="M48 10 L42 16 L46 18 Z" /><path d="M16 38 L22 32 L18 30 Z" /><path d="M48 38 L42 32 L46 30 Z" /></g>
      <circle cx="32" cy="24" r="17" fill="url(#pf-b)" stroke="#7A5200" strokeWidth="1.6" />
      <ellipse cx="32" cy="33" rx="10" ry="5" fill="#FFF3C4" opacity=".55" />
      <g fill="#8A6D1B" opacity=".5"><circle cx="26" cy="16" r="1" /><circle cx="34" cy="12" r="1" /><circle cx="40" cy="30" r="1" /><circle cx="24" cy="28" r="1" /><circle cx="38" cy="18" r=".8" /></g>
      <path d="M18 26 q-4 3-2 6 q3-1 4-4 Z" fill="#D9A41C" stroke="#7A5200" strokeWidth="1" opacity=".9" />
      <path d="M46 26 q4 3 2 6 q-3-1-4-4 Z" fill="#D9A41C" stroke="#7A5200" strokeWidth="1" opacity=".9" />
      <circle cx="24" cy="20" r="3.4" fill="#FFF6D8" /><circle cx="24" cy="20" r="3" fill="#231600" /><circle cx="23" cy="19" r="1.1" fill="#FFF6D8" />
      <circle cx="40" cy="20" r="3.4" fill="#FFF6D8" /><circle cx="40" cy="20" r="3" fill="#231600" /><circle cx="39" cy="19" r="1.1" fill="#FFF6D8" />
      <circle cx="32" cy="31" r="2.2" fill="#B8860B" /><circle cx="32" cy="31" r="1.2" fill="#7A5200" />
      <ellipse cx="26" cy="14" rx="6" ry="3.4" fill="#FFF6D8" opacity=".5" transform="rotate(-18 26 14)" />
    </svg>
  );
  if (kind === "clown") return (
    <svg viewBox="0 0 64 48" width={size} height={size * 0.75} aria-hidden="true" className="v18-fishart">
      <defs><linearGradient id="cf-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FF9A3D" /><stop offset="1" stopColor="#E5322D" /></linearGradient>
      <linearGradient id="cf-t" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#E5322D" /><stop offset="1" stopColor="#FF7A3D" /></linearGradient></defs>
      <path className="v18-tail" d="M13 24 C6 15 2 17 0 24 C2 31 6 33 13 24 Z" fill="url(#cf-t)" stroke="#7A0F0F" strokeWidth="1" />
      <path d="M12 24 C22 10 44 8 54 20 C58 24 58 24 54 28 C44 40 22 38 12 24 Z" fill="url(#cf-b)" stroke="#7A0F0F" strokeWidth="1.4" />
      <path d="M22 12 q4-5 10-4 q3-1 6 1 q-8 4-16 3 Z" fill="#FF7A3D" stroke="#7A0F0F" strokeWidth="1" />
      <g fill="#FFF6D8" stroke="#14213D" strokeWidth="1.1">
        <path d="M23 14 q-3 10 0 20 q2.5-1 2.5-10 q0-9-2.5-10 Z" />
        <path d="M35 12 q-3 12 0 24 q2.5-1 2.5-12 q0-11-2.5-12 Z" />
        <path d="M47 15 q-2.5 9 0 18 q2-1 2-9 q0-8-2-9 Z" />
      </g>
      <path d="M34 28 q5 6 11 4 q-2-6-11-4 Z" fill="#FF7A3D" stroke="#7A0F0F" strokeWidth="1" opacity=".9" />
      <g fill="none" stroke="#FFD9A8" strokeWidth="0.8" opacity=".5">
        <path d="M20 20 q2.5 2.5 5 0 M28 17 q2.5 2.5 5 0 M42 20 q2.5 2.5 5 0" />
      </g>
      <circle cx="48" cy="21" r="3.2" fill="#FFF6D8" /><circle cx="48" cy="21" r="2.6" fill="#231600" /><circle cx="47" cy="20" r="1" fill="#FFF6D8" />
    </svg>
  );
  if (kind === "koi") return (
    <svg viewBox="0 0 64 48" width={size} height={size * 0.75} aria-hidden="true" className="v18-fishart">
      <defs><linearGradient id="kf-b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#FFE9A8" /><stop offset=".5" stopColor="#F2C230" /><stop offset="1" stopColor="#D9A41C" /></linearGradient>
      <linearGradient id="kf-t" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#FFD964" /><stop offset="1" stopColor="#E85D2A" /></linearGradient></defs>
      <g className="v18-tail">
        <path d="M15 24 C9 18 4 19 2 24 C4 29 9 30 15 24 Z" fill="#E85D2A" opacity=".55" />
        <path d="M15 24 C7 14 2 16 0 24 C2 32 7 34 15 24 Z" fill="url(#kf-t)" stroke="#8A6D1B" strokeWidth="1" />
      </g>
      <path d="M14 24 C24 10 46 10 56 22 C58 24 58 24 56 26 C46 38 24 38 14 24 Z" fill="url(#kf-b)" stroke="#7A5200" strokeWidth="1.4" />
      <g fill="#E85D2A" stroke="#B03A12" strokeWidth="0.8">
        <path d="M36 13 q7 0 9 4 q1 4-4 5 q-7 1-8-4 q0-4 3-5 Z" />
        <path d="M24 26 q7-2 10 2 q2 4-3 6 q-7 1-8-4 q0-3 1-4 Z" />
        <path d="M17 16 q4-1 5 2 q0 3-4 3 q-3-1-1-5 Z" />
      </g>
      <path d="M26 11 q6-4 13-2 q-6 4-13 2 Z" fill="#FFE9A8" stroke="#8A6D1B" strokeWidth="0.8" opacity=".9" />
      <path d="M32 29 q3 7 9 8 q-1-7-9-8 Z" fill="#FFE9A8" stroke="#8A6D1B" strokeWidth="0.8" opacity=".75" />
      <path d="M40 30 q2 6 7 7 q-1-6-7-7 Z" fill="#FFE9A8" stroke="#8A6D1B" strokeWidth="0.8" opacity=".75" />
      <g fill="none" stroke="#FFF3C4" strokeWidth="0.9" opacity=".5">
        <path d="M22 18 q3 3 6 0 M22 26 q3 3 6 0 M30 16 q3 3 6 0 M30 30 q3 3 6 0 M40 18 q3 3 6 0" />
      </g>
      <path d="M44 15 q-3 9 0 18" fill="none" stroke="#7A5200" strokeWidth="1.1" opacity=".5" strokeLinecap="round" />
      <circle cx="50" cy="21" r="3.2" fill="#FFF6D8" /><circle cx="50" cy="21" r="2.6" fill="#231600" /><circle cx="49" cy="20" r="1" fill="#FFF6D8" />
      <path d="M56 26 q5 2 7 5 M56 22 q5-2 7-5" fill="none" stroke="#8A6D1B" strokeWidth="1.4" strokeLinecap="round" />
      <ellipse cx="34" cy="16" rx="7" ry="3" fill="#FFF6D8" opacity=".45" transform="rotate(-14 34 16)" />
    </svg>
  );
  return (
    <svg viewBox="0 0 64 48" width={size} height={size * 0.75} aria-hidden="true" className="v18-fishart">
      <defs><linearGradient id="mf-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#D6F0FF" /><stop offset=".45" stopColor="#7CC0F5" /><stop offset=".8" stopColor="#3E7FC4" /><stop offset="1" stopColor="#2B5F9E" /></linearGradient>
      <linearGradient id="mf-t" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#2B5F9E" /><stop offset="1" stopColor="#5AA9FF" /></linearGradient></defs>
      <path className="v18-tail" d="M15 24 L3 14 L7 24 L3 34 Z" fill="url(#mf-t)" stroke="#14213D" strokeWidth="1" strokeLinejoin="round" />
      <path d="M14 24 C24 11 46 10 56 22 C58 24 58 24 56 26 C46 38 24 37 14 24 Z" fill="url(#mf-b)" stroke="#14213D" strokeWidth="1.3" />
      <g fill="none" stroke="#BFE8FF" strokeWidth="0.9" opacity=".55">
        <path d="M24 18 q3 3 6 0 M24 24 q3 3 6 0 M24 30 q3 3 6 0" />
        <path d="M32 16 q3 3 6 0 M32 22 q3 3 6 0 M32 28 q3 3 6 0" />
        <path d="M40 18 q3 3 6 0 M40 24 q3 3 6 0" />
      </g>
      <path d="M16 25 C28 23 42 23 54 24" fill="none" stroke="#EAF7FF" strokeWidth="1" opacity=".6" />
      <path d="M28 12 q5-4 11-1 q-5 3-11 1 Z" fill="#2B5F9E" opacity=".85" />
      <path d="M30 30 q4 5 9 4 q-2-5-9-4 Z" fill="#5AA9FF" opacity=".7" />
      <path d="M44 15 q-3 9 0 18" fill="none" stroke="#14213D" strokeWidth="1.2" opacity=".55" strokeLinecap="round" />
      <circle cx="49" cy="21" r="3.2" fill="#FFF6D8" /><circle cx="49" cy="21" r="2.6" fill="#14213D" /><circle cx="48" cy="20" r="1" fill="#FFF6D8" />
      <ellipse cx="32" cy="17" rx="8" ry="3" fill="#FFF6D8" opacity=".5" transform="rotate(-12 32 17)" />
    </svg>
  );
}

function RodArt() {
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" className="v18-rodart">
      <ellipse cx="92" cy="99" rx="17" ry="4.5" fill="none" stroke="#FFF6D8" strokeWidth="1.2" opacity=".35" />
      <ellipse cx="92" cy="99" rx="10" ry="3" fill="none" stroke="#FFF6D8" strokeWidth="1.2" opacity=".5" />
      <path d="M14 106 C40 72 70 44 104 18" fill="none" stroke="#6B4A12" strokeWidth="4.6" strokeLinecap="round" />
      <path d="M14 106 C40 72 70 44 104 18" fill="none" stroke="#C99612" strokeWidth="1.4" strokeLinecap="round" opacity=".8" />
      <path d="M14 106 L26 92" fill="none" stroke="#B08954" strokeWidth="8" strokeLinecap="round" />
      <path d="M17 103 L21 100 M20 100 L24 97 M23 97 L27 94" stroke="#7A5A28" strokeWidth="1" strokeLinecap="round" />
      <circle cx="34" cy="86" r="5.5" fill="#3A2A08" stroke="#F2C230" strokeWidth="1.6" />
      <circle cx="34" cy="86" r="2.2" fill="#F2C230" />
      <path d="M34 91 L40 96" stroke="#F2C230" strokeWidth="2" strokeLinecap="round" />
      <circle cx="41" cy="97" r="2" fill="#231600" stroke="#F2C230" strokeWidth="1" />
      <g fill="none" stroke="#F2C230" strokeWidth="1.6"><circle cx="56" cy="67" r="2.6" /><circle cx="79" cy="47" r="2.6" /><circle cx="96" cy="28" r="2.6" /></g>
      <path d="M34 86 C52 68 76 44 104 18 C106 34 102 48 96 58" fill="none" stroke="#FFF6D8" strokeWidth="1.3" strokeDasharray="3 3" opacity=".85" />
      <circle cx="92" cy="86" r="6.5" fill="#FFF6D8" stroke="#7A0F0F" strokeWidth="1.4" />
      <path d="M85.5 86 a6.5 6.5 0 0 1 13 0 Z" fill="#E5322D" />
      <circle cx="90" cy="84" r="1.6" fill="#FFF6D8" opacity=".95" />
      <path d="M92 93 q0 6-4 6 q-3 0-3-3" fill="none" stroke="#F2C230" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="60" cy="102" r="2" fill="#FFF6D8" opacity=".6" /><circle cx="76" cy="110" r="1.6" fill="#FFF6D8" opacity=".5" />
    </svg>
  );
}

function HorseArt({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 64 44" aria-hidden="true" className="v18-horseart">
      <path d="M10 26 C10 18 20 14 30 15 C38 16 44 14 48 10 L52 6 L55 9 L51 14 C54 18 54 24 50 28 L46 30 L44 36 L40 36 L41 29 L34 27 L30 34 L26 34 L28 26 L20 25 L16 32 L12 32 L14 25 C11 25 10 26 10 26 Z" fill={color} stroke="#231600" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M30 15 C36 13 42 12 46 10" fill="none" stroke="#231600" strokeWidth="2.4" strokeLinecap="round" opacity=".55" />
      <path d="M12 20 C16 16 24 14 30 15" fill="none" stroke="#FFF6D8" strokeWidth="1.6" strokeLinecap="round" opacity=".35" />
      <path d="M34 27 L42 28 L44 24 L36 23 Z" fill="#F2C230" stroke="#7A5200" strokeWidth="1" />
      <circle cx="52" cy="9" r="1.3" fill="#231600" />
      <path d="M48 8 L50 4 L53 7" fill={color} stroke="#231600" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}

function FlagArt() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="v18-flagart">
      <path d="M6 2 L6 22" stroke="#8A6D1B" strokeWidth="2.2" strokeLinecap="round" />
      <g><rect x="6" y="2" width="16" height="12" rx="1" fill="#FFF6D8" stroke="#14213D" strokeWidth="1" />
      <rect x="10" y="2" width="4" height="4" fill="#14213D" /><rect x="18" y="2" width="4" height="4" fill="#14213D" />
      <rect x="6" y="6" width="4" height="4" fill="#14213D" /><rect x="14" y="6" width="4" height="4" fill="#14213D" />
      <rect x="10" y="10" width="4" height="4" fill="#14213D" /><rect x="18" y="10" width="4" height="4" fill="#14213D" /></g>
    </svg>
  );
}

// ---------- Tower Climb ----------
type Diff = "easy" | "medium" | "hard";
const DIFFS: Record<Diff, { cols: number; rows: number; ladder: number[]; label: string }> = {
  easy: { cols: 4, rows: 8, ladder: [1.2, 1.5, 1.9, 2.4, 3.0, 3.8, 4.8, 6.0], label: "Easy · 4 tiles" },
  medium: { cols: 3, rows: 6, ladder: [1.4, 2.0, 2.8, 4.0, 5.6, 8.0], label: "Medium · 3 tiles" },
  hard: { cols: 2, rows: 4, ladder: [1.9, 3.5, 6.0, 10.0], label: "Hard · 2 tiles" },
};

export function TowerClimbRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(10);
  const [diff, setDiff] = useState<Diff>("easy");
  const [traps, setTraps] = useState<number[]>([]);
  const [row, setRow] = useState(0);
  const [picked, setPicked] = useState<(number | null)[]>([]);
  const [phase, setPhase] = useState<"idle" | "climbing" | "done">("idle");
  const [msg, setMsg] = useState("Pick a difficulty, then tap one tile per row. One tile per row hides a trap — cash out any time before it.");
  const cfg = DIFFS[diff];

  const start = () => {
    if (room.balance < stake) { setMsg("Balance too low for that stake."); return; }
    const t: number[] = [];
    for (let r = 0; r < cfg.rows; r++) t.push(Math.floor(Math.random() * cfg.cols));
    setTraps(t);
    setPicked(new Array(cfg.rows).fill(null));
    setRow(0);
    setPhase("climbing");
    setMsg(`Climbing ${cfg.label} — tap a tile on the bottom row.`);
  };

  const pickTile = async (col: number) => {
    if (phase !== "climbing") return;
    const p = [...picked];
    p[row] = col;
    setPicked(p);
    if (col === traps[row]) {
      setPhase("done");
      setMsg(`Trap on row ${row + 1}! The climb ends — the stake is gone.`);
      await room.settle(stake, 0, { diff, row, trapped: true });
      return;
    }
    // Safe tile — a pop for the step up (the trap path stays silent).
    playSfx("pop", room.muted);
    const mult = cfg.ladder[row];
    if (row === cfg.rows - 1) {
      setPhase("done");
      const payout = Math.round(stake * mult * 100) / 100;
      setMsg(`Top of the tower! ×${mult} — ${fmtMoney(payout, room.user?.currency ?? "GHS")}`);
      await room.settle(stake, payout, { diff, row, mult });
      return;
    }
    setRow(row + 1);
    setMsg(`Safe! ×${mult} banked — cash out or climb to row ${row + 2} (×${cfg.ladder[row + 1]}).`);
  };

  const cashOut = async () => {
    if (phase !== "climbing" || row === 0) return;
    const mult = cfg.ladder[row - 1];
    const payout = Math.round(stake * mult * 100) / 100;
    setPhase("done");
    setMsg(`Cashed out at row ${row} — ×${mult}, ${fmtMoney(payout, room.user?.currency ?? "GHS")}!`);
    await room.settle(stake, payout, { diff, row: row - 1, mult });
  };

  const curMult = row > 0 && phase !== "idle" ? cfg.ladder[row - 1] : 1;

  return (
    <RoomShell game={game} subtitle="Tower Climb — one safe tile per row, one trap. Climb the ladder or cash out." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency="cash" disabled={phase === "climbing"} />
        <div className="v18-picks" role="group" aria-label="Difficulty">
          {(Object.keys(DIFFS) as Diff[]).map((d) => (
            <button key={d} type="button" aria-pressed={diff === d} onClick={() => setDiff(d)} disabled={phase === "climbing"}>{DIFFS[d].label}</button>
          ))}
        </div>
        <div className="v18-tower" role="group" aria-label="Tower">
          {Array.from({ length: cfg.rows }, (_, r) => {
            const ri = cfg.rows - 1 - r; // top row first in the DOM
            const done = ri < row || (phase === "done" && ri <= row);
            const active = ri === row && phase === "climbing";
            const isTrap = phase === "done" && picked[ri] === traps[ri];
            return (
              <div key={ri} className="v18-trow">
                <span className="v18-tmult">×{cfg.ladder[ri]}</span>
                {Array.from({ length: cfg.cols }, (_, c) => (
                  <button key={c} type="button" className={`v18-ttile${active ? " active" : ""}${done && picked[ri] === c && !isTrap ? " safe" : ""}${isTrap ? " trap" : ""}`} disabled={!active} onClick={() => void pickTile(c)} aria-label={`Row ${ri + 1}, tile ${c + 1}`}>
                    {done && picked[ri] === c ? (isTrap ? <TileMark kind="burst" /> : <TileMark kind="check" />) : phase === "done" && c === traps[ri] ? <TileMark kind="burst" /> : <TileMark kind="gem" />}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
        {phase === "idle" && <button className="btn btn-gold xg-action" type="button" onClick={start}>Start climbing · {fmtMoney(stake, room.user?.currency ?? "GHS")}</button>}
        {phase === "climbing" && row > 0 && <button className="btn btn-gold xg-action" type="button" onClick={() => void cashOut()}>CASH OUT · {fmtMoney(Math.round(stake * curMult * 100) / 100, room.user?.currency ?? "GHS")} (×{curMult})</button>}
        {phase === "done" && <button className="btn btn-gold xg-action" type="button" onClick={start}>Climb again · {fmtMoney(stake, room.user?.currency ?? "GHS")}</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}

// ---------- Golden Catch ----------
interface Fish { id: number; kind: "minnow" | "clown" | "puffer" | "koi"; x: number; y: number; v: number; dir: 1 | -1; size: number }
const FISH_VAL: Record<Fish["kind"], number> = { minnow: 0.2, clown: 0.5, puffer: 1.0, koi: 2.0 };
const FISH_SIZE: Record<Fish["kind"], number> = { minnow: 32, clown: 40, puffer: 46, koi: 56 };
// Speeds in % of pond width per second — a fish crosses the pond in
// ~4–8s (koi fastest, minnow slowest). Old speeds (v 6–20, 0.16%/tick
// once a second) were 0.96–3.2 %/s: a slow fish took ~100s to cross.
const FISH_SPEED: Record<Fish["kind"], [number, number]> = { minnow: [12, 15], clown: [15, 19], puffer: [18, 22], koi: [22, 26] };
// Rising bubbles for the pond — fixed layout, staggered rise times.
const BUBBLES = [
  { left: 12, size: 7, dur: 5, delay: 0 },
  { left: 28, size: 5, dur: 6.5, delay: 1.4 },
  { left: 38, size: 6, dur: 5.2, delay: 2.1 },
  { left: 47, size: 9, dur: 4.5, delay: 2.6 },
  { left: 66, size: 6, dur: 5.8, delay: 0.7 },
  { left: 74, size: 5, dur: 6, delay: 4 },
  { left: 84, size: 8, dur: 4.2, delay: 3.1 },
];

function spawnFish(id: number): Fish {
  const r = Math.random();
  const kind: Fish["kind"] = r < 0.5 ? "minnow" : r < 0.8 ? "clown" : r < 0.94 ? "puffer" : "koi";
  const dir = Math.random() < 0.5 ? 1 : -1;
  const [lo, hi] = FISH_SPEED[kind];
  return { id, kind, x: dir === 1 ? -10 : 110, y: 8 + Math.random() * 70, v: lo + Math.random() * (hi - lo), dir, size: FISH_SIZE[kind] };
}

export function GoldenCatchRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(10);
  const [phase, setPhase] = useState<"idle" | "playing" | "done">("idle");
  const [fishes, setFishes] = useState<Fish[]>([]);
  const [pot, setPot] = useState(0);
  const [caught, setCaught] = useState(0);
  const [secs, setSecs] = useState(30);
  const [splashes, setSplashes] = useState<{ id: number; x: number; y: number }[]>([]);
  const [msg, setMsg] = useState("30 seconds in the pond — tap fish to catch them. Minnow 0.2×, clownfish 0.5×, puffer 1×, golden koi 2×. Your pot is your multiplier, capped at ×10.");
  const idRef = useRef(0);
  const splashIdRef = useRef(0);
  const potRef = useRef(0);
  const caughtRef = useRef(0);
  const settledRef = useRef(false);

  const end = async (reason: string) => {
    setPhase("done");
    setFishes([]);
    const mult = Math.min(10, Math.round(potRef.current * 100) / 100);
    const payout = Math.round(stake * mult * 100) / 100;
    setMsg(`${reason} — you caught ${caughtRef.current} fish for a ×${mult.toFixed(1)} pot. ${payout > 0 ? fmtMoney(payout, room.user?.currency ?? "GHS") : "Nothing in the net."}`);
    if (!settledRef.current) {
      settledRef.current = true;
      await room.settle(stake, payout, { caught: caughtRef.current, pot: mult });
    }
  };

  const start = () => {
    if (room.balance < stake) { setMsg("Balance too low for that stake."); return; }
    settledRef.current = false;
    potRef.current = 0;
    caughtRef.current = 0;
    setPot(0); setCaught(0); setSecs(30);
    setFishes([spawnFish(idRef.current++), spawnFish(idRef.current++), spawnFish(idRef.current++), spawnFish(idRef.current++)]);
    setPhase("playing");
    setMsg("Go! Tap the fish!");
  };

  // Fish swim + respawn on a fast 100ms tick (smooth glide, ~4–8s to
  // cross the pond); the clock ticks once a second on its own interval.
  // When the clock hits 0 the round ends (watched in an effect, not
  // inside a state updater).
  useEffect(() => {
    if (phase !== "playing") return;
    const swim = window.setInterval(() => {
      setFishes((prev) => {
        let next = prev.map((f) => ({ ...f, x: f.x + f.v * f.dir * 0.1 }));
        next = next.filter((f) => f.x > -15 && f.x < 115);
        while (next.length < 4) next.push(spawnFish(idRef.current++));
        return next;
      });
    }, 100);
    const clock = window.setInterval(() => {
      setSecs((s) => Math.max(0, s - 1));
    }, 1000);
    return () => { window.clearInterval(swim); window.clearInterval(clock); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (phase === "playing" && secs === 0) void end("Time!");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secs, phase]);

  const catchFish = (f: Fish) => {
    if (phase !== "playing") return;
    playSfx("pop", room.muted);
    potRef.current = Math.round((potRef.current + FISH_VAL[f.kind]) * 100) / 100;
    caughtRef.current += 1;
    setPot(potRef.current);
    setCaught((c) => c + 1);
    setFishes((prev) => prev.filter((x) => x.id !== f.id));
    // Splash ring where the fish was caught, gone after the animation.
    const sid = splashIdRef.current++;
    setSplashes((prev) => [...prev, { id: sid, x: f.x, y: f.y }]);
    window.setTimeout(() => setSplashes((prev) => prev.filter((s) => s.id !== sid)), 650);
    if (potRef.current >= 10) { void end("Pot full — ×10!"); }
  };

  return (
    <RoomShell game={game} subtitle="Golden Catch — 30 seconds, tap the fish. Your pot is your multiplier, capped at ×10." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency="cash" disabled={phase === "playing"} />
        <div className="v18-stage">
          <div className="v18-hud"><span>TIME <b>{secs}s</b></span><span>POT <b>×{pot.toFixed(1)}</b></span><span>CAUGHT <b>{caught}</b></span></div>
          <div className="v18-pond" role="group" aria-label="Fishing pond">
            {BUBBLES.map((b, i) => (
              <span key={i} className="v18-bubble" style={{ left: `${b.left}%`, width: b.size, height: b.size, animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s` }} aria-hidden="true" />
            ))}
            {phase === "playing" && fishes.map((f) => (
              <button key={f.id} type="button" className={`v18-fish v18-fish-${f.kind}`} style={{ left: `${f.x}%`, top: `${f.y}%`, transform: f.dir === -1 ? "scaleX(-1)" : undefined }} onClick={() => catchFish(f)} aria-label={`${f.kind} fish, worth ${FISH_VAL[f.kind]}x`}><FishArt kind={f.kind} size={f.size} /></button>
            ))}
            {splashes.map((s) => (
              <span key={s.id} className="v18-splash" style={{ left: `${s.x}%`, top: `${s.y}%` }} aria-hidden="true" />
            ))}
            {phase !== "playing" && <span className="v18-pondidle"><RodArt /></span>}
          </div>
          <p className="v18-aim">Minnow 0.2× · Clownfish 0.5× · Puffer 1× · Golden koi 2×</p>
        </div>
        {phase === "idle" && <button className="btn btn-gold xg-action" type="button" onClick={start}>Cast your line · {fmtMoney(stake, room.user?.currency ?? "GHS")}</button>}
        {phase === "done" && <button className="btn btn-gold xg-action" type="button" onClick={start}>Fish again · {fmtMoney(stake, room.user?.currency ?? "GHS")}</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}

// ---------- Gold Rush Derby ----------
interface Horse { name: string; color: string; pos: number; speed: number }
const HORSES: { name: string; color: string }[] = [
  { name: "Golden Comet", color: "#F2C230" },
  { name: "Midnight Star", color: "#9B8CFF" },
  { name: "Red Rocket", color: "#E5322D" },
  { name: "Emerald Flash", color: "#3ED97E" },
];

export function GoldRushDerbyRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(10);
  const [pick, setPick] = useState(0);
  const [horses, setHorses] = useState<Horse[]>(HORSES.map((h) => ({ ...h, pos: 0, speed: 0 })));
  const [phase, setPhase] = useState<"idle" | "racing" | "done">("idle");
  const [winner, setWinner] = useState<number | null>(null);
  const [msg, setMsg] = useState("Pick a horse — if it wins the race, it pays ×4. Four horses, one winner, no dead heats here.");

  const race = async () => {
    if (room.balance < stake) { setMsg("Balance too low for that stake."); return; }
    setPhase("racing");
    setWinner(null);
    playSfx("spin", room.muted);
    let hs = HORSES.map((h) => ({ ...h, pos: 0, speed: 0.8 + Math.random() * 0.6 }));
    setHorses(hs);
    setMsg(`And they're off! ${HORSES[pick].name} is your horse.`);
    const iv = window.setInterval(() => {
      hs = hs.map((h) => {
        const burst = Math.random() < 0.06 ? 1.6 : 1;
        const next = h.pos + h.speed * burst * (0.7 + Math.random() * 0.6);
        return { ...h, pos: Math.min(100, next), speed: h.speed };
      });
      setHorses(hs);
      const fin = hs.findIndex((h) => h.pos >= 100);
      if (fin >= 0) {
        window.clearInterval(iv);
        setWinner(fin);
        setPhase("done");
        const won = fin === pick;
        const payout = won ? Math.round(stake * 4 * 100) / 100 : 0;
        setMsg(won ? `${HORSES[fin].name} wins by a nose! ×4 — ${fmtMoney(payout, room.user?.currency ?? "GHS")}` : `${HORSES[fin].name} takes it. Your horse, ${HORSES[pick].name}, didn't place.`);
        void room.settle(stake, payout, { pick, winner: fin, horse: HORSES[fin].name });
      }
    }, 120);
  };

  return (
    <RoomShell game={game} subtitle="Gold Rush Derby — pick a horse, watch the race. Your horse first pays ×4." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency="cash" disabled={phase === "racing"} />
        <div className="v18-picks" role="group" aria-label="Pick a horse">
          {HORSES.map((h, i) => (
            <button key={h.name} type="button" aria-pressed={pick === i} onClick={() => setPick(i)} disabled={phase === "racing"}><span className="v18-silk" style={{ background: `linear-gradient(135deg, ${h.color} 55%, #FFF6D8 55%)` }} aria-hidden="true" /> {h.name}</button>
          ))}
        </div>
        <div className="v18-track" aria-label="Race track">
          {horses.map((h, i) => (
            <div key={h.name} className="v18-lane">
              <span className="v18-hname" style={{ color: h.color }}>{h.name}</span>
              <span className="v18-horse" style={{ left: `${h.pos}%` }}><HorseArt color={h.color} /></span>
              {winner === i && <span className="v18-winflag"><FlagArt /></span>}
            </div>
          ))}
        </div>
        {phase !== "racing" && <button className="btn btn-gold xg-action" type="button" onClick={() => void race()}>{phase === "done" ? `Race again · ${fmtMoney(stake, room.user?.currency ?? "GHS")}` : `Start the race · ${fmtMoney(stake, room.user?.currency ?? "GHS")}`}</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}
