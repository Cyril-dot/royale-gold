// Dice Roll 3D dice mount — client-only. Loaded with ssr:false from
// DiceRoom; the Three.js module is dynamically imported inside
// useEffect. roll() runs the physics throw and lands on the port's
// pre-decided values; the DOM dice stay as the no-WebGL fallback.

"use client";

import { useEffect, useRef } from "react";
import type { DiceScene } from "../../lib/three/dice";

export interface DiceHandle {
  roll: (
    targets: [number, number],
    onDone: (values: [number, number]) => void,
  ) => void;
}

export default function Dice3D({
  controllerRef,
  onReady,
}: {
  controllerRef: { current: DiceHandle | null };
  onReady: (ok: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let scene: DiceScene | null = null;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import("../../lib/three/dice");
        if (cancelled) return;
        scene = new mod.DiceScene(canvas);
        controllerRef.current = {
          roll: (targets, onDone) => scene?.roll(targets, onDone),
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

  return <canvas ref={canvasRef} id="drGl" className="dr-3d" aria-hidden="true" />;
}
