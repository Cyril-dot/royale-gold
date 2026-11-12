// Coin Flip 3D coin mount — client-only. Loaded with ssr:false from
// CoinFlipRoom; the Three.js module is dynamically imported inside
// useEffect. flip() animates to the port's pre-decided face; the DOM
// coin disc stays as the no-WebGL fallback.

"use client";

import { useEffect, useRef } from "react";
import type { CoinFace, CoinFlipScene } from "../../lib/three/coinFlip";

export interface CoinFlipHandle {
  flip: (outcome: CoinFace, onDone: (outcome: CoinFace) => void) => void;
}

export default function CoinFlip3D({
  controllerRef,
  onReady,
}: {
  controllerRef: { current: CoinFlipHandle | null };
  onReady: (ok: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let scene: CoinFlipScene | null = null;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import("../../lib/three/coinFlip");
        if (cancelled) return;
        scene = new mod.CoinFlipScene(canvas);
        controllerRef.current = {
          flip: (outcome, onDone) => scene?.flip(outcome, onDone),
        };
        onReadyRef.current(true);
      } catch {
        if (!cancelled) {
          canvas.style.display = "none";
          onReadyRef.current(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      controllerRef.current = null;
      scene?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvasRef} id="cfGl" className="cf-3d" aria-hidden="true" />;
}
