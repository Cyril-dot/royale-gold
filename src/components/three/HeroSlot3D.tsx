// Hero 3D slot mount — client-only. The canvas is rendered by this
// component (loaded with ssr:false from Hero.tsx) and the Three.js
// scene module is dynamically imported inside useEffect, so three.js
// never executes on the server. If WebGL is unavailable the canvas is
// hidden and the DOM fallback/reels (Hero.tsx) show instead.

"use client";

import { useEffect, useRef } from "react";
import type { HeroSlotScene } from "../../lib/three/heroSlot";

export interface HeroSlotHandle {
  spin: (picks: [number, number, number], onDone: () => void) => void;
}

export default function HeroSlot3D({
  controllerRef,
  onReady,
}: {
  controllerRef: { current: HeroSlotHandle | null };
  onReady: (ok: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let scene: HeroSlotScene | null = null;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import("../../lib/three/heroSlot");
        if (cancelled) return;
        scene = new mod.HeroSlotScene(canvas);
        controllerRef.current = {
          spin: (picks, onDone) => scene?.spin(picks, onDone),
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

  return <canvas ref={canvasRef} id="gl" aria-hidden="true" />;
}
