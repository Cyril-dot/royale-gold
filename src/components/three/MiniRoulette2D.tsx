// Mini Roulette 2D canvas wheel (#mrGl) — ported from the v48 artifact
// (casino-homepage.html, Roulette IIFE, original lines 10450-10558).
// The artifact's wheel is a plain 2D canvas (NOT Three.js); the port's
// DOM wheel (a 110px numbered circle) is the degraded version, so the
// canvas render is restored here: European wheel, 37 pockets in the
// standard ORDER, red/black/green, gold rim, ivory ball that
// counter-spins and dies into the pointer.
//
// Render layer only: the port decides the pocket FIRST (at the click,
// as the port's MiniRouletteRoom does) and hands it to spin() — the
// wheel then spins 4400ms (cubic ease-out, 5 full turns + delta to the
// pocket) and lands on it, then onDone fires and the room settles.
// The DOM wheel stays as the fallback if 2D canvas is unavailable.

"use client";

import { useEffect, useRef } from "react";

export interface MiniRouletteHandle {
  spin: (pocket: number, onDone: () => void) => void;
}

const ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
  24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
const REDS: Record<number, 1> = {
  1: 1, 3: 1, 5: 1, 7: 1, 9: 1, 12: 1, 14: 1, 16: 1, 18: 1, 19: 1, 21: 1,
  23: 1, 25: 1, 27: 1, 30: 1, 32: 1, 34: 1, 36: 1,
};
const SEG = 360 / 37;

function colorOf(n: number): string {
  return n === 0 ? "#0B7A38" : REDS[n] ? "#C22828" : "#171A29";
}

export default function MiniRoulette2D({
  controllerRef,
  onReady,
}: {
  controllerRef: { current: MiniRouletteHandle | null };
  onReady: (ok: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ rot: 0, spinning: false, raf: 0 });
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) {
      onReadyRef.current(false);
      return;
    }
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const draw = (ballAng: number | null, ballR: number) => {
      const x = g;
      const cx = 260;
      const cy = 260;
      const rot = stateRef.current.rot;
      x.clearRect(0, 0, 520, 520);
      x.beginPath();
      x.arc(cx, cy, 254, 0, 7);
      x.fillStyle = "#8A5A16";
      x.fill();
      x.beginPath();
      x.arc(cx, cy, 246, 0, 7);
      x.fillStyle = "#C99612";
      x.fill();
      for (let i = 0; i < 37; i++) {
        const a0 = ((rot + i * SEG - 90) * Math.PI) / 180;
        const a1 = ((rot + (i + 1) * SEG - 90) * Math.PI) / 180;
        x.beginPath();
        x.moveTo(cx, cy);
        x.arc(cx, cy, 232, a0, a1);
        x.closePath();
        x.fillStyle = colorOf(ORDER[i]);
        x.fill();
        x.lineWidth = 1.4;
        x.strokeStyle = "rgba(242,194,48,.5)";
        x.stroke();
        const mid = ((rot + i * SEG + SEG / 2 - 90) * Math.PI) / 180;
        x.save();
        x.translate(cx, cy);
        x.rotate(mid);
        x.translate(200, 0);
        x.rotate(Math.PI / 2);
        x.font = "900 19px Outfit, sans-serif";
        x.textAlign = "center";
        x.textBaseline = "middle";
        x.fillStyle = "#FFF6D8";
        x.fillText(String(ORDER[i]), 0, 0);
        x.restore();
      }
      x.beginPath();
      x.arc(cx, cy, 118, 0, 7);
      const hg = x.createRadialGradient(cx - 20, cy - 24, 8, cx, cy, 118);
      hg.addColorStop(0, "#17503C");
      hg.addColorStop(1, "#081F18");
      x.fillStyle = hg;
      x.fill();
      x.lineWidth = 3;
      x.strokeStyle = "#C99612";
      x.stroke();
      x.font = "900 30px Outfit, sans-serif";
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.fillStyle = "#F2C230";
      x.fillText("₵", cx, cy + 2);
      // Pointer
      x.beginPath();
      x.moveTo(cx - 13, 2);
      x.lineTo(cx + 13, 2);
      x.lineTo(cx, 30);
      x.closePath();
      x.fillStyle = "#FFD964";
      x.fill();
      x.strokeStyle = "#9A7410";
      x.stroke();
      // The ball
      if (ballAng != null) {
        const ba = (ballAng * Math.PI) / 180;
        const br2 = ballR || 240;
        x.beginPath();
        x.arc(cx + Math.cos(ba) * br2, cy + Math.sin(ba) * br2, 9, 0, 7);
        x.fillStyle = "#FDFBF2";
        x.fill();
        x.strokeStyle = "#9AA0B0";
        x.stroke();
      }
    };

    const spin = (pocket: number, onDone: () => void) => {
      const st = stateRef.current;
      if (st.spinning) return;
      const idx = ORDER.indexOf(pocket);
      const centre = idx * SEG + SEG / 2;
      const curMod = ((st.rot % 360) + 360) % 360;
      const need = ((0 - centre) % 360 + 360) % 360;
      const delta = ((need - curMod) % 360 + 360) % 360;
      const from = st.rot;
      const target = st.rot + 5 * 360 + delta;
      st.spinning = true;
      if (reduced) {
        st.rot = target;
        st.spinning = false;
        draw(-90, 224);
        onDone();
        return;
      }
      const t0 = performance.now();
      const dur = 4400;
      const frame = (now: number) => {
        if (!st.spinning) return;
        const k = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - k, 3);
        st.rot = from + (target - from) * e;
        const ballAng = -90 - (1 - e) * 1440 - e * 0; // ball counter-spins, dies into the pointer
        const ballR = k < 0.8 ? 240 : 240 - ((k - 0.8) / 0.2) * 16;
        draw(ballAng + (1 - e) * -720, ballR);
        if (k < 1) {
          st.raf = requestAnimationFrame(frame);
        } else {
          st.rot = target;
          st.spinning = false;
          draw(-90, 224);
          onDone();
        }
      };
      st.raf = requestAnimationFrame(frame);
    };

    controllerRef.current = { spin };
    draw(-90, 224);
    onReadyRef.current(true);
    return () => {
      controllerRef.current = null;
      cancelAnimationFrame(stateRef.current.raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mr-wheel-box">
      <canvas
        ref={canvasRef}
        width={520}
        height={520}
        aria-label="Mini Roulette wheel — 37 pockets: 18 red, 18 black, 1 green zero"
      />
    </div>
  );
}
