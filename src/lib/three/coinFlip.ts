// Coin Flip 3D gold coin (#cfGl) — ported from the v48 artifact
// (casino-homepage.html, CoinGame IIFE, original lines 5841-6050).
// One PBR gold coin (star face = Heads, crown face = Tails) on a green
// felt disc with a gold rim, in the shared xgStage scene.
//
// Render layer only: the port decides the outcome FIRST (at the click,
// as the port's CoinFlipRoom does) and hands it to flip() — the flip
// then animates to that face: 5-6 full spins (rotation.x) + delta to
// the called face (0 = Heads, π = Tails), 2350ms, cubic ease-out, with
// a hop (y up to +3.3, wobble, bounce in the last 20%). onDone fires
// with the outcome when the coin lands; the room settles then.
// Idle: slow turntable spin (rotation.y += .004/frame).
//
// The scene owns its rAF loop while mounted (the artifact ran its loop
// only while the room was open; in the port the component mounts with
// the room page, so mount == open). Dispose on unmount.

import * as THREE from "three";
import {
  createFeltDisc,
  createStage,
  disposeStage,
  prefersReducedMotion,
  sizeStage,
  type Stage,
} from "./stage";

export type CoinFace = "HEADS" | "TAILS";

const REST_Y = 0.09;

function coinFaceTexture(kind: "star" | "crown"): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const x = c.getContext("2d")!;
  const cx = 256;
  const cy = 256;
  const g = x.createRadialGradient(cx - 90, cy - 110, 40, cx, cy, 262);
  g.addColorStop(0, "#FFEFA8");
  g.addColorStop(0.5, "#F2C230");
  g.addColorStop(0.85, "#D9A41C");
  g.addColorStop(1, "#B57F0E");
  x.fillStyle = g;
  x.beginPath();
  x.arc(cx, cy, 256, 0, 7);
  x.fill();
  x.strokeStyle = "rgba(122,82,0,.85)";
  x.lineWidth = 7;
  x.beginPath();
  x.arc(cx, cy, 238, 0, 7);
  x.stroke();
  x.strokeStyle = "rgba(255,246,216,.9)";
  x.lineWidth = 6;
  x.setLineDash([12, 10]);
  x.beginPath();
  x.arc(cx, cy, 216, 0, 7);
  x.stroke();
  x.setLineDash([]);
  x.strokeStyle = "rgba(122,82,0,.5)";
  x.lineWidth = 3;
  x.beginPath();
  x.arc(cx, cy, 186, 0, 7);
  x.stroke();
  function glyphPath() {
    x.beginPath();
    if (kind === "star") {
      const R = 104;
      const r = 44;
      for (let i = 0; i < 10; i++) {
        const rad = i % 2 ? r : R;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const px = cx + Math.cos(a) * rad;
        const py = cy + Math.sin(a) * rad;
        if (i) x.lineTo(px, py);
        else x.moveTo(px, py);
      }
      x.closePath();
    } else {
      x.moveTo(cx - 102, cy + 52);
      x.lineTo(cx - 102, cy - 40);
      x.lineTo(cx - 54, cy + 2);
      x.lineTo(cx, cy - 62);
      x.lineTo(cx + 54, cy + 2);
      x.lineTo(cx + 102, cy - 40);
      x.lineTo(cx + 102, cy + 52);
      x.closePath();
      x.rect(cx - 102, cy + 68, 204, 20);
      [cx - 102, cx, cx + 102].forEach((px) => {
        x.moveTo(px + 14, cy - 40);
        x.arc(px, cy - 40, 14, 0, 7);
      });
    }
  }
  x.save();
  x.translate(0, 7);
  x.fillStyle = "#8A5F06";
  glyphPath();
  x.fill();
  x.restore();
  const g2 = x.createLinearGradient(cx, cy - 110, cx, cy + 110);
  g2.addColorStop(0, "#E8B71E");
  g2.addColorStop(1, "#A87B0E");
  x.fillStyle = g2;
  glyphPath();
  x.fill();
  x.strokeStyle = "rgba(122,82,0,.65)";
  x.lineWidth = 4;
  glyphPath();
  x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class CoinFlipScene {
  private stage: Stage;
  private cam: THREE.PerspectiveCamera;
  private coin: THREE.Mesh;
  private rotX = 0;
  private anim: {
    t0: number;
    dur: number;
    from: number;
    total: number;
    outcome: CoinFace;
  } | null = null;
  private onDone: ((outcome: CoinFace) => void) | null = null;
  private raf = 0;
  private reduced: boolean;
  private disposed = false;
  private box: HTMLElement;
  private onResize: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.reduced = prefersReducedMotion();
    this.box = canvas.parentElement as HTMLElement;
    const st = createStage(canvas);
    this.stage = st;
    this.cam = new THREE.PerspectiveCamera(40, 1.6, 0.1, 100);
    this.cam.position.set(0, 3.6, 6.6);
    this.cam.lookAt(0, 0.9, 0);
    st.scene.add(createFeltDisc(3.6));
    const side = new THREE.MeshStandardMaterial({
      color: 0xe9be33,
      metalness: 1,
      roughness: 0.3,
    });
    const heads = new THREE.MeshStandardMaterial({
      map: coinFaceTexture("star"),
      metalness: 0.72,
      roughness: 0.38,
    });
    const tails = new THREE.MeshStandardMaterial({
      map: coinFaceTexture("crown"),
      metalness: 0.72,
      roughness: 0.38,
    });
    this.coin = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.05, 0.16, 72),
      [side, heads, tails],
    );
    this.coin.castShadow = true;
    this.coin.position.y = REST_Y;
    st.scene.add(this.coin);
    sizeStage(st, this.cam, this.box);

    this.onResize = () => sizeStage(this.stage, this.cam, this.box);
    window.addEventListener("resize", this.onResize);

    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Flip to the port's pre-decided face, then call onDone(outcome). */
  flip(outcome: CoinFace, onDone: (outcome: CoinFace) => void): void {
    this.onDone = onDone;
    if (this.reduced) {
      // Snap to the called face, settle on a short timer (artifact).
      const spins = 5 * Math.PI * 2;
      const desired = outcome === "TAILS" ? Math.PI : 0;
      const curMod = ((this.rotX % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const delta = ((desired - curMod) + Math.PI * 2) % (Math.PI * 2);
      this.coin.rotation.x = this.rotX + spins + delta;
      this.rotX = this.coin.rotation.x;
      setTimeout(() => {
        if (this.disposed) return;
        const cb = this.onDone;
        this.onDone = null;
        if (cb) cb(outcome);
      }, 130);
      return;
    }
    const spins = (5 + Math.floor(Math.random() * 2)) * Math.PI * 2;
    const desired = outcome === "TAILS" ? Math.PI : 0;
    const curMod = ((this.rotX % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const delta = ((desired - curMod) + Math.PI * 2) % (Math.PI * 2);
    this.anim = {
      t0: performance.now(),
      dur: 2350,
      from: this.rotX,
      total: spins + delta,
      outcome,
    };
  }

  private frame(): void {
    if (this.anim) {
      const u = Math.min(1, (performance.now() - this.anim.t0) / this.anim.dur);
      const e = 1 - Math.pow(1 - u, 3);
      this.coin.rotation.x = this.anim.from + this.anim.total * e;
      this.coin.rotation.z = Math.sin(u * Math.PI) * 0.16 * (1 - u);
      this.coin.position.x = Math.sin(u * Math.PI) * 0.35;
      if (u < 0.8) {
        const p = u / 0.8;
        this.coin.position.y =
          REST_Y + 3.3 * (1 - Math.pow(2 * p - 1, 2));
      } else {
        const v = (u - 0.8) / 0.2;
        this.coin.position.y =
          REST_Y + Math.abs(Math.sin(v * Math.PI * 2)) * 0.14 * (1 - v);
      }
      if (u >= 1) {
        this.coin.rotation.x = this.anim.from + this.anim.total;
        this.rotX = this.coin.rotation.x;
        this.coin.rotation.z = 0;
        this.coin.position.x = 0;
        this.coin.position.y = REST_Y;
        const oc = this.anim.outcome;
        this.anim = null;
        const cb = this.onDone;
        this.onDone = null;
        if (cb) cb(oc);
      }
    } else if (!this.reduced) {
      this.coin.rotation.y += 0.004;
    }
    this.stage.renderer.render(this.stage.scene, this.cam);
  }

  dispose(): void {
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    disposeStage(this.stage);
  }
}
