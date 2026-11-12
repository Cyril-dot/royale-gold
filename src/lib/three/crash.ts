// Crash 3D scenes (#crGl / #jfGl) — ported from the v48 artifact
// (casino-homepage.html: CrashGame IIFE, original lines 8470-8884, and
// JetGame IIFE, original lines 11322-11898). One engine, four vehicle
// skins in the Crash scene (plane / jet / rocket / car); Jet Fly has
// its own scene with the v41 SAFE BOX so the jet never leaves the
// stage and a banked holding pattern at fly-away.
//
// Render layer only: the port's CrashRoom owns the round (server
// round, hash, reveal, cash-outs, payouts). The scenes read a plain
// state object each frame — { mult, elapsed, phase, vehState, vehT0 }
// — via a getState callback the room supplies. They never decide a
// crash point and never pre-animate one: the vehicle rides the curve
// from the port's live multiplier, and vehState comes from the room:
//   running, no cash yet  -> "fly"   (on-curve)
//   running, bet cashed   -> "cash"  (Crash scene only; Jet stays "fly")
//   crashed               -> "crash" (Crash: falls) / "away" (Jet: holds)
//   otherwise             -> "idle"  (parked)
// vehT0 is in the performance.now() domain — the moment the current
// vehState began (cash-out time / crash time, as the room records it).
//
// The port's existing 2D canvas stays as the no-WebGL fallback —
// these scenes hide it (via the .has-3d class) only when WebGL
// initialises. The scenes own their rAF loop + resize while mounted;
// dispose on unmount.

import * as THREE from "three";
import {
  createStage,
  disposeStage,
  sizeStage,
  type Stage,
} from "./stage";

export const CRASH_GROWTH = 0.00006;
export const CRASH_CAP = 50;

export interface CrashSceneState {
  mult: number;
  /** Seconds since takeoff, frozen at the crash point when crashed. */
  elapsed: number;
  phase: "idle" | "waiting" | "running" | "crashed";
  vehState: "idle" | "fly" | "crash" | "cash" | "away";
  /** performance.now() timestamp when the current vehState began. */
  vehT0: number;
}

export type CrashSkin = "aviator" | "jet" | "rocket" | "car";

const SKIN_VEH: Record<CrashSkin, string> = {
  aviator: "plane",
  jet: "jet",
  rocket: "rocket",
  car: "car",
};

/* ---------------- shared builders (artifact mat/box + vehicles) ---------------- */

function mat(
  color: number,
  rough?: number,
  metal?: number,
  emissive?: number,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: rough == null ? 0.4 : rough,
    metalness: metal == null ? 0.5 : metal,
    emissive: emissive || 0x000000,
  });
}

function box(
  w: number,
  h: number,
  d: number,
  m: THREE.Material,
): THREE.Mesh {
  const q = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  q.castShadow = true;
  return q;
}

function buildPlane(): THREE.Group {
  const g = new THREE.Group();
  const red = mat(0xe5322d, 0.35, 0.3);
  const dark = mat(0x14213d, 0.4, 0.4);
  const gold = mat(0xf2c230, 0.3, 1);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 2.5, 20), red);
  body.rotation.z = Math.PI / 2;
  body.castShadow = true;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 20), gold);
  nose.rotation.z = -Math.PI / 2;
  nose.position.x = 1.55;
  g.add(nose);
  const wing = box(1.1, 0.07, 2.5, red);
  wing.position.set(-0.1, -0.05, 0);
  g.add(wing);
  const tail = box(0.5, 0.6, 0.08, red);
  tail.position.set(-1.25, 0.3, 0);
  g.add(tail);
  const fin = box(0.5, 0.07, 1.0, red);
  fin.position.set(-1.25, 0.05, 0);
  g.add(fin);
  const cock = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 16, 12),
    mat(0xbfe3ff, 0.15, 0.2),
  );
  cock.scale.set(1.4, 0.7, 1);
  cock.position.set(0.45, 0.3, 0);
  g.add(cock);
  const prop = new THREE.Group();
  const p1 = box(0.05, 1.0, 0.09, dark);
  const p2 = box(0.05, 0.09, 1.0, dark);
  prop.add(p1);
  prop.add(p2);
  prop.position.x = 1.95;
  prop.name = "spinner";
  g.add(prop);
  return g;
}

function buildJetCrash(): THREE.Group {
  const g = new THREE.Group();
  const sil = mat(0xc7d2e8, 0.25, 0.9);
  const blue = mat(0x2b5ea7, 0.35, 0.6);
  const gold = mat(0xf2c230, 0.3, 1);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 2.7, 20), sil);
  body.rotation.z = Math.PI / 2;
  body.castShadow = true;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.0, 20), blue);
  nose.rotation.z = -Math.PI / 2;
  nose.position.x = 1.85;
  g.add(nose);
  const w1 = box(1.0, 0.06, 1.3, blue);
  w1.position.set(-0.3, -0.1, 0.75);
  w1.rotation.y = 0.5;
  g.add(w1);
  const w2 = box(1.0, 0.06, 1.3, blue);
  w2.position.set(-0.3, -0.1, -0.75);
  w2.rotation.y = -0.5;
  g.add(w2);
  const tail = box(0.45, 0.55, 0.07, blue);
  tail.position.set(-1.35, 0.28, 0);
  g.add(tail);
  const stripe = box(2.2, 0.1, 0.64, gold);
  stripe.position.set(0.1, 0.12, 0);
  g.add(stripe);
  const cock = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 16, 12),
    mat(0x8fd0ff, 0.12, 0.3),
  );
  cock.scale.set(1.5, 0.65, 1);
  cock.position.set(0.6, 0.3, 0);
  g.add(cock);
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.2, 0.8, 14),
    mat(0xff9e2c, 0.5, 0, 0xcc5500),
  );
  flame.rotation.z = Math.PI / 2;
  flame.position.x = -1.7;
  flame.name = "flame";
  g.add(flame);
  return g;
}

function buildJetFly(): THREE.Group {
  // Jet Fly's own builder (artifact JetGame): flame is longer and sits
  // slightly further back than the Crash scene's jet.
  const g = new THREE.Group();
  const sil = mat(0xc7d2e8, 0.22, 0.9);
  const blue = mat(0x2b5ea7, 0.35, 0.6);
  const gold = mat(0xf2c230, 0.3, 1);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 2.7, 20), sil);
  body.rotation.z = Math.PI / 2;
  body.castShadow = true;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.0, 20), blue);
  nose.rotation.z = -Math.PI / 2;
  nose.position.x = 1.85;
  g.add(nose);
  const w1 = box(1.0, 0.06, 1.3, blue);
  w1.position.set(-0.3, -0.1, 0.75);
  w1.rotation.y = 0.5;
  g.add(w1);
  const w2 = box(1.0, 0.06, 1.3, blue);
  w2.position.set(-0.3, -0.1, -0.75);
  w2.rotation.y = -0.5;
  g.add(w2);
  const tail = box(0.45, 0.55, 0.07, blue);
  tail.position.set(-1.35, 0.28, 0);
  g.add(tail);
  const stripe = box(2.2, 0.1, 0.64, gold);
  stripe.position.set(0.1, 0.12, 0);
  g.add(stripe);
  const cock = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 16, 12),
    mat(0x8fd0ff, 0.12, 0.3),
  );
  cock.scale.set(1.5, 0.65, 1);
  cock.position.set(0.6, 0.3, 0);
  g.add(cock);
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.2, 0.9, 14),
    mat(0xff9e2c, 0.5, 0, 0xcc5500),
  );
  flame.rotation.z = Math.PI / 2;
  flame.position.x = -1.75;
  flame.name = "flame";
  g.add(flame);
  return g;
}

function buildRocket(): THREE.Group {
  const g = new THREE.Group();
  const white = mat(0xf4f1e4, 0.3, 0.35);
  const red = mat(0xe5322d, 0.35, 0.3);
  const gold = mat(0xf2c230, 0.3, 1);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 2.2, 20), white);
  body.rotation.z = Math.PI / 2;
  body.castShadow = true;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.9, 20), red);
  nose.rotation.z = -Math.PI / 2;
  nose.position.x = 1.55;
  g.add(nose);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.3, 20), gold);
  band.rotation.z = Math.PI / 2;
  band.position.x = 0.5;
  g.add(band);
  [-1, 0, 1].forEach((k) => {
    const fin = box(0.7, 0.6, 0.07, red);
    fin.position.set(-1.15, k === 0 ? 0.35 : -0.1, k === 0 ? 0 : k > 0 ? 0.3 : -0.3);
    if (k !== 0) fin.rotation.x = k * 0.9;
    g.add(fin);
  });
  const win = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 0.05, 16),
    mat(0x8fd0ff, 0.15, 0.3),
  );
  win.rotation.x = Math.PI / 2;
  win.position.set(0.55, 0.2, 0.3);
  g.add(win);
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.24, 1.1, 14),
    mat(0xff9e2c, 0.5, 0, 0xcc5500),
  );
  flame.rotation.z = Math.PI / 2;
  flame.position.x = -1.65;
  flame.name = "flame";
  g.add(flame);
  return g;
}

function buildCar(): THREE.Group {
  const g = new THREE.Group();
  const red = mat(0xc22828, 0.3, 0.45);
  const dark = mat(0x10131f, 0.35, 0.5);
  const gold = mat(0xf2c230, 0.3, 1);
  const body = box(2.5, 0.42, 1.15, red);
  body.position.y = 0.05;
  g.add(body);
  const nose = box(0.7, 0.24, 1.05, red);
  nose.position.set(1.35, -0.04, 0);
  g.add(nose);
  const cab = box(1.1, 0.36, 0.95, mat(0x8fd0ff, 0.15, 0.3));
  cab.position.set(-0.15, 0.4, 0);
  g.add(cab);
  const spoiler = box(0.16, 0.08, 1.25, gold);
  spoiler.position.set(-1.3, 0.42, 0);
  g.add(spoiler);
  const s1 = box(0.4, 0.3, 0.07, dark);
  s1.position.set(-1.3, 0.22, 0.55);
  g.add(s1);
  const s2 = box(0.4, 0.3, 0.07, dark);
  s2.position.set(-1.3, 0.22, -0.55);
  g.add(s2);
  const wg = new THREE.CylinderGeometry(0.27, 0.27, 0.16, 18);
  [
    [0.85, 0.6],
    [0.85, -0.6],
    [-0.85, 0.6],
    [-0.85, -0.6],
  ].forEach((p) => {
    const w = new THREE.Mesh(wg, dark);
    w.rotation.x = Math.PI / 2;
    w.position.set(p[0], -0.22, p[1]);
    w.name = "wheel";
    g.add(w);
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.18, 12),
      gold,
    );
    hub.rotation.x = Math.PI / 2;
    hub.position.copy(w.position);
    g.add(hub);
  });
  return g;
}

/** Night-sky grid backdrop (artifact backdropTex). Jet Fly's variant
 *  adds city lights along the bottom. */
function backdropTexture(withCity: boolean): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 576;
  const x = c.getContext("2d")!;
  const g = x.createLinearGradient(0, 0, 0, 576);
  g.addColorStop(0, withCity ? "#18315F" : "#16295E");
  g.addColorStop(0.7, "#0A1130");
  g.addColorStop(1, "#05070F");
  x.fillStyle = g;
  x.fillRect(0, 0, 1024, 576);
  x.strokeStyle = "rgba(255,232,154,.13)";
  x.lineWidth = 1;
  for (let i = 1; i < 10; i++) {
    x.beginPath();
    x.moveTo(i * 102.4, 0);
    x.lineTo(i * 102.4, 576);
    x.stroke();
  }
  for (let j = 1; j < 6; j++) {
    x.beginPath();
    x.moveTo(0, j * 96);
    x.lineTo(1024, j * 96);
    x.stroke();
  }
  x.fillStyle = "rgba(255,232,154,.9)";
  for (let s = 0; s < 70; s++) {
    x.beginPath();
    x.arc(Math.random() * 1024, Math.random() * 300, Math.random() * 1.8 + 0.4, 0, 7);
    x.fill();
  }
  if (withCity) {
    x.fillStyle = "#070B18";
    let bx = 0;
    while (bx < 1024) {
      const bw = 30 + Math.random() * 60;
      const bh = 26 + Math.random() * 60;
      x.fillRect(bx, 576 - bh, bw, bh);
      bx += bw + 4;
    }
    x.fillStyle = "rgba(255,217,100,.85)";
    for (let wnd = 0; wnd < 260; wnd++) {
      x.fillRect(Math.random() * 1024, 500 + Math.random() * 70, 2.4, 3);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeCurveLine(scene: THREE.Scene): {
  line: THREE.Line;
  pos: Float32Array;
} {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(3 * 80);
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const line = new THREE.Line(
    geo,
    new THREE.LineBasicMaterial({ color: 0xffd964 }),
  );
  scene.add(line);
  return { line, pos };
}

function makeExhaust(scene: THREE.Scene): {
  points: THREE.Points;
  pos: Float32Array;
  mat: THREE.PointsMaterial;
} {
  const eg = new THREE.BufferGeometry();
  const pos = new Float32Array(3 * 90);
  eg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({
    color: 0xffd964,
    size: 0.14,
    transparent: true,
    opacity: 0.75,
  });
  const points = new THREE.Points(eg, m);
  scene.add(points);
  return { points, pos, mat: m };
}

/* ---------------- Crash scene (Aviator plane / jet / rocket / car) ---------------- */

export class CrashScene {
  private stage: Stage;
  private cam: THREE.PerspectiveCamera;
  private vehicles: Record<string, THREE.Group> = {};
  private skin: CrashSkin;
  private curvePos: Float32Array;
  private curveLine: THREE.Line;
  private exhaustPos: Float32Array;
  private exhaust: THREE.Points;
  private exhaustMat: THREE.PointsMaterial;
  private getState: () => CrashSceneState;
  private raf = 0;
  private disposed = false;
  private box: HTMLElement;
  private onResize: () => void;
  private ro: ResizeObserver | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    skin: CrashSkin,
    getState: () => CrashSceneState,
  ) {
    this.skin = skin;
    this.getState = getState;
    this.box = canvas.parentElement as HTMLElement;
    const st = createStage(canvas);
    this.stage = st;
    this.cam = new THREE.PerspectiveCamera(45, 1.6, 0.1, 100);
    this.cam.position.set(0, 1.6, 9.5);
    this.cam.lookAt(0, 0.6, 0);
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(17, 9.5),
      new THREE.MeshBasicMaterial({ map: backdropTexture(false) }),
    );
    bg.position.z = -2.5;
    st.scene.add(bg);
    this.vehicles = {
      plane: buildPlane(),
      jet: buildJetCrash(),
      rocket: buildRocket(),
      car: buildCar(),
    };
    Object.keys(this.vehicles).forEach((k) => {
      this.vehicles[k].visible = SKIN_VEH[skin] === k;
      this.vehicles[k].position.set(-5.4, -2.4, 0);
      st.scene.add(this.vehicles[k]);
    });
    const curve = makeCurveLine(st.scene);
    this.curveLine = curve.line;
    this.curvePos = curve.pos;
    const ex = makeExhaust(st.scene);
    this.exhaust = ex.points;
    this.exhaustPos = ex.pos;
    this.exhaustMat = ex.mat;
    sizeStage(st, this.cam, this.box);

    this.onResize = () => sizeStage(this.stage, this.cam, this.box);
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(this.onResize);
      this.ro.observe(this.box);
    }
    window.addEventListener("resize", this.onResize);

    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      this.update(this.getState());
    };
    this.raf = requestAnimationFrame(loop);
  }

  setSkin(skin: CrashSkin): void {
    this.skin = skin;
    Object.keys(this.vehicles).forEach(
      (k) => (this.vehicles[k].visible = SKIN_VEH[skin] === k),
    );
  }

  private curvePoint(
    tSec: number,
    span: number,
    maxLog: number,
  ): [number, number] {
    const m = Math.exp(CRASH_GROWTH * tSec * 1000);
    const x = -6 + 12 * (tSec / span);
    const y = -2.7 + 5.4 * (Math.log(Math.max(m, 1.0001)) / maxLog);
    return [x, Math.min(y, 3.1)];
  }

  /** Port of the artifact's updateScene(m, elapsed). */
  update(s: CrashSceneState): void {
    const m = s.mult;
    const elapsed = s.elapsed;
    const span = Math.max(10, elapsed * 1.15);
    const maxLog = Math.log(Math.max(m * 1.35, 2.2));
    for (let i = 0; i < 80; i++) {
      const t = (elapsed * i) / 79;
      const p = this.curvePoint(t, span, maxLog);
      this.curvePos[i * 3] = p[0];
      this.curvePos[i * 3 + 1] = p[1];
      this.curvePos[i * 3 + 2] = 0;
    }
    this.curveLine.geometry.attributes.position.needsUpdate = true;
    const head = this.curvePoint(elapsed, span, maxLog);
    const prev = this.curvePoint(Math.max(0, elapsed - 0.4), span, maxLog);
    const veh = this.vehicles[SKIN_VEH[this.skin]];
    if (!veh) return;
    const ang = Math.atan2(head[1] - prev[1], head[0] - prev[0]);
    if (s.vehState === "crash") {
      const u = Math.min(1, (performance.now() - s.vehT0) / 1600);
      veh.position.set(head[0], head[1] - u * u * 3.4, 0);
      veh.rotation.z = ang - u * 2.6;
    } else if (s.vehState === "cash") {
      const v = Math.min(1, (performance.now() - s.vehT0) / 1400);
      veh.position.set(head[0] + v * 1.2, head[1] + v * 1.6, 0);
      veh.rotation.z = ang + v * 0.5;
    } else if (s.phase === "running") {
      veh.position.set(head[0], head[1], 0);
      veh.rotation.z = ang;
    } else {
      veh.position.set(-5.4, -2.4, 0);
      veh.rotation.z = 0;
    }
    veh.traverse((o) => {
      if (o.name === "spinner") o.rotation.x += 0.9;
      if (o.name === "flame")
        o.scale.set(
          1,
          0.8 + Math.random() * 0.5 + Math.min(1.2, Math.log(Math.max(m, 1)) * 0.3),
          0.8 + Math.random() * 0.4,
        );
      if (o.name === "wheel") o.rotation.z -= 0.25;
    });
    // Exhaust trail: shift old points back, spawn at the tail.
    const ep = this.exhaustPos;
    for (let k = ep.length - 1; k >= 3; k--) ep[k] = ep[k - 3];
    for (let s2 = 0; s2 < 3; s2++) {
      const idx = Math.floor(Math.random() * 30) * 3;
      ep[idx] = veh.position.x - 1.2;
      ep[idx + 1] = veh.position.y + (Math.random() - 0.5) * 0.3;
      ep[idx + 2] = 0;
    }
    this.exhaust.geometry.attributes.position.needsUpdate = true;
    this.exhaustMat.opacity =
      s.phase === "running"
        ? Math.min(0.9, 0.35 + Math.log(Math.max(m, 1)) * 0.18)
        : 0.25;
    this.exhaustMat.color.setHex(s.vehState === "cash" ? 0x3ed97e : 0xffd964);
    this.cam.position.z =
      9.5 + Math.min(3.5, Math.log(Math.max(m, 1)) * 1.1);
    this.cam.lookAt(0, 0.6, 0);
    this.stage.renderer.render(this.stage.scene, this.cam);
  }

  dispose(): void {
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.ro) this.ro.disconnect();
    window.removeEventListener("resize", this.onResize);
    disposeStage(this.stage);
  }
}

/* ---------------- Jet Fly scene (v41 SAFE BOX) ---------------- */

const SAFE = { x0: -2.3, x1: 2.3, y0: -1.2, y1: 2.3 };
const IDLE_POS: [number, number] = [-2.25, -1.15];

function clampJet(x: number, y: number): [number, number] {
  return [
    Math.max(SAFE.x0, Math.min(SAFE.x1, x)),
    Math.max(SAFE.y0, Math.min(SAFE.y1, y)),
  ];
}

export class JetScene {
  private stage: Stage;
  private cam: THREE.PerspectiveCamera;
  private jet: THREE.Group;
  private curvePos: Float32Array;
  private curveLine: THREE.Line;
  private exhaustPos: Float32Array;
  private exhaust: THREE.Points;
  private exhaustMat: THREE.PointsMaterial;
  private getState: () => CrashSceneState;
  private raf = 0;
  private disposed = false;
  private box: HTMLElement;
  private onResize: () => void;
  private ro: ResizeObserver | null = null;
  private lastElapsed = 0;
  private lastSpan = 10;
  private lastMaxLog = 1;
  private lastAng = 0;
  private awayPos: { x: number; y: number; ang: number } | null = null;
  private lastVehState: CrashSceneState["vehState"] = "idle";

  constructor(canvas: HTMLCanvasElement, getState: () => CrashSceneState) {
    this.getState = getState;
    this.box = canvas.parentElement as HTMLElement;
    const st = createStage(canvas);
    this.stage = st;
    this.cam = new THREE.PerspectiveCamera(45, 1.6, 0.1, 100);
    this.cam.position.set(0, 1.6, 9.5);
    this.cam.lookAt(0, 0.6, 0);
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(17, 9.5),
      new THREE.MeshBasicMaterial({ map: backdropTexture(true) }),
    );
    bg.position.z = -2.5;
    st.scene.add(bg);
    this.jet = buildJetFly();
    this.jet.position.set(IDLE_POS[0], IDLE_POS[1], 0);
    st.scene.add(this.jet);
    const curve = makeCurveLine(st.scene);
    this.curveLine = curve.line;
    this.curvePos = curve.pos;
    const ex = makeExhaust(st.scene);
    this.exhaust = ex.points;
    this.exhaustPos = ex.pos;
    this.exhaustMat = ex.mat;
    sizeStage(st, this.cam, this.box);

    this.onResize = () => sizeStage(this.stage, this.cam, this.box);
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(this.onResize);
      this.ro.observe(this.box);
    }
    window.addEventListener("resize", this.onResize);

    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      this.update(this.getState());
    };
    this.raf = requestAnimationFrame(loop);
  }

  private curvePoint(
    tSec: number,
    span: number,
    maxLog: number,
  ): [number, number] {
    const m = Math.exp(CRASH_GROWTH * tSec * 1000);
    const x = SAFE.x0 + (SAFE.x1 - SAFE.x0) * (tSec / span);
    const y =
      SAFE.y0 +
      (SAFE.y1 - SAFE.y0) * (Math.log(Math.max(m, 1.0001)) / maxLog);
    return clampJet(x, y);
  }

  private headPoint(
    m: number,
    elapsed: number,
  ): { pt: [number, number]; span: number; maxLog: number } {
    const span = Math.max(10, elapsed * 1.15);
    const maxLog = Math.log(Math.max(m * 1.35, 2.2));
    this.lastSpan = span;
    this.lastMaxLog = maxLog;
    this.lastElapsed = elapsed;
    return { pt: this.curvePoint(elapsed, span, maxLog), span, maxLog };
  }

  /** Port of the artifact JetGame's updateScene(m, elapsed). */
  update(s: CrashSceneState): void {
    const m = s.mult;
    const elapsed = s.elapsed;
    const hp = this.headPoint(m, elapsed);
    for (let i = 0; i < 80; i++) {
      const t = (elapsed * i) / 79;
      const p = this.curvePoint(t, hp.span, hp.maxLog);
      this.curvePos[i * 3] = p[0];
      this.curvePos[i * 3 + 1] = p[1];
      this.curvePos[i * 3 + 2] = 0;
    }
    this.curveLine.geometry.attributes.position.needsUpdate = true;
    const head = hp.pt;
    const prev = this.curvePoint(Math.max(0, elapsed - 0.4), hp.span, hp.maxLog);
    // Pitch capped at ~31°: the raw curve slope at takeoff (~37°) would
    // swing the tail corner below the frame at the bottom edge.
    const ang = Math.max(
      -0.12,
      Math.min(0.55, Math.atan2(head[1] - prev[1], head[0] - prev[0])),
    );
    this.lastAng = ang;

    // v41: NO exit. At the crash point the jet levels off into a small
    // banked holding pattern around the crash point, clamped inside
    // the safe box. awayPos is fixed from the last running frame, as
    // the artifact's doCrash did.
    if (s.vehState === "away" && this.lastVehState !== "away") {
      const h = this.curvePoint(this.lastElapsed, this.lastSpan, this.lastMaxLog);
      this.awayPos = { x: h[0], y: h[1], ang: this.lastAng };
    }
    if (s.vehState !== "away") this.awayPos = null;
    this.lastVehState = s.vehState;

    if (s.vehState === "away" && this.awayPos) {
      const ht = (performance.now() - s.vehT0) / 1000;
      const hp2 = clampJet(
        this.awayPos.x + Math.sin(ht * 2.4) * 0.3,
        this.awayPos.y + Math.cos(ht * 2.4) * 0.2,
      );
      if (hp2[0] < -1.9) hp2[0] = -1.9; // banking near the left edge must not swing the tail out
      this.jet.visible = true;
      this.jet.position.set(hp2[0], hp2[1], 0);
      this.jet.rotation.z =
        this.awayPos.ang * 0.3 + Math.sin(ht * 2.4) * 0.26;
    } else if (s.vehState === "fly" || s.phase === "running") {
      this.jet.visible = true;
      this.jet.position.set(head[0], head[1], 0);
      this.jet.rotation.z = ang;
    } else {
      this.jet.visible = true;
      this.jet.position.set(
        IDLE_POS[0],
        IDLE_POS[1] + Math.sin(performance.now() / 480) * 0.06,
        0,
      );
      this.jet.rotation.z = 0;
    }
    this.jet.traverse((o) => {
      if (o.name === "flame")
        o.scale.set(
          1,
          0.8 + Math.random() * 0.5 + Math.min(1.2, Math.log(Math.max(m, 1)) * 0.3),
          0.8 + Math.random() * 0.4,
        );
    });
    const ep = this.exhaustPos;
    for (let k = ep.length - 1; k >= 3; k--) ep[k] = ep[k - 3];
    for (let s2 = 0; s2 < 3; s2++) {
      const idx = Math.floor(Math.random() * 30) * 3;
      ep[idx] = this.jet.position.x - 1.4;
      ep[idx + 1] = this.jet.position.y + (Math.random() - 0.5) * 0.3;
      ep[idx + 2] = 0;
    }
    this.exhaust.geometry.attributes.position.needsUpdate = true;
    this.exhaustMat.opacity =
      s.phase === "running"
        ? Math.min(0.9, 0.35 + Math.log(Math.max(m, 1)) * 0.18)
        : 0.25;
    this.cam.position.z =
      9.5 + Math.min(3.5, Math.log(Math.max(m, 1)) * 1.1);
    this.cam.lookAt(0, 0.6, 0);
    this.stage.renderer.render(this.stage.scene, this.cam);
  }

  dispose(): void {
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.ro) this.ro.disconnect();
    window.removeEventListener("resize", this.onResize);
    disposeStage(this.stage);
  }
}
