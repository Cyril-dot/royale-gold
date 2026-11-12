// Crash 3D scene mount (Aviator plane / Jet Fly jet) — client-only.
// Loaded with ssr:false from CrashRoom; the Three.js module is
// dynamically imported inside useEffect, so three.js never executes
// on the server. The scene reads the room's live state from stateRef
// every frame (mult / elapsed / phase / vehState / vehT0) and renders
// over the 2D canvas, which stays as the no-WebGL fallback.

"use client";

import { useEffect, useRef } from "react";
import type { CrashScene, CrashSceneState, JetScene } from "../../lib/three/crash";

export default function CrashScene3D({
  skin,
  stateRef,
  onReady,
}: {
  skin: "aviator" | "jet";
  stateRef: { current: CrashSceneState };
  onReady: (ok: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let scene: CrashScene | JetScene | null = null;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import("../../lib/three/crash");
        if (cancelled) return;
        scene =
          skin === "jet"
            ? new mod.JetScene(canvas, () => stateRef.current)
            : new mod.CrashScene(canvas, "aviator", () => stateRef.current);
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
      scene?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skin]);

  return <canvas ref={canvasRef} className="cr-3d" aria-hidden="true" />;
}
