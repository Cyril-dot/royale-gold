// Live demo jackpot counter, exactly as the v48 export's Jackpot module:
// starts at GH₵ 412,399.96 with 18,450 playing, then every 1.6s the
// jackpot climbs by GH₵ 2–16 and the online count jitters ±28 (floor
// 15,000). One shared module-level value so the hero card, the header
// ticker and every .jp-val on the page always agree.

"use client";

import { useEffect, useState } from "react";

export const JACKPOT_START = 412399.96;
export const ONLINE_START = 18450;

let jackpot = JACKPOT_START;
let online = ONLINE_START;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

let timer: ReturnType<typeof setInterval> | null = null;
function ensureTimer() {
  if (timer || typeof window === "undefined") return;
  timer = setInterval(() => {
    jackpot += Math.random() * 14 + 2;
    online += Math.floor(Math.random() * 61) - 28;
    if (online < 15000) online = 15000;
    emit();
  }, 1600);
}

export function fmtJackpot(v: number) {
  return "GH₵ " + v.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function useJackpot() {
  const [, setTick] = useState(0);
  useEffect(() => {
    ensureTimer();
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return { jackpot, online, jackpotText: fmtJackpot(jackpot), onlineText: online.toLocaleString("en-GH") };
}
