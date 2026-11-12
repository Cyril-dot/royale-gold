// Hero 3D slot machine (#gl) — ported from the v48 artifact
// (casino-homepage.html, module "hero-3d", original lines 5196-5528).
// Own renderer/scene/camera (NOT the shared xgStage): three spinning
// symbol drums among floating gold coins, tumbling pip dice, a roulette
// wheel (stage left, orbiting ivory ball), chip stacks (stage right)
// and gold dust, over a felt floor with a gold ring.
//
// The ONLY input is spin(picks, onDone): picks are symbol indices 0..5
// (the port's SYMBOLS order — ["7","♠","♥","♦","♣","★"] — shares the
// artifact's index order, so the prize table, which is index-based,
// stays exact; the drum faces themselves are the artifact's original
// art: 0=7, 1=Emerald, 2=Cherries, 3=Coin, 4=Bell, 5=Clover). Drums
// animate to picks[i]*SEG with 2-4 full turns, staggered 0.18s,
// ease-out, then onDone fires. Idle drift runs from mount, exactly
// like the artifact (unconditional rAF loop, unless reduced motion).
//
// The scene owns its rAF loop + resize handling and must be disposed
// on unmount (cancel rAF, disconnect observers/listeners, dispose the
// renderer) — the artifact never stopped; the port navigates away.

import * as THREE from "three";
import {
  createStage,
  disposeStage,
  mulberry,
  prefersReducedMotion,
  sizeStage,
  type Stage,
} from "./stage";

const SEG = Math.PI / 3;
const RADIUS = 0.44;

type Spinner = {
  obj: THREE.Object3D;
  sy?: number;
  sx?: number;
  sz?: number;
  bob: number;
  y0: number;
  tumble?: boolean;
};

type Drum = {
  grp: THREE.Group;
  anim: { from: number; to: number; t0: number; dur: number } | null;
};

function dieTexture(pips: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fdfbf4";
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = "#14213d";
  const P: Record<string, [number, number]> = {
    tl: [34, 34],
    tr: [94, 34],
    ml: [34, 64],
    c: [64, 64],
    mr: [94, 64],
    bl: [34, 94],
    br: [94, 94],
  };
  const faces: Record<number, string[]> = {
    1: ["c"],
    2: ["tl", "br"],
    3: ["tl", "c", "br"],
    4: ["tl", "tr", "bl", "br"],
    5: ["tl", "tr", "c", "bl", "br"],
    6: ["tl", "tr", "ml", "mr", "bl", "br"],
  };
  faces[pips].forEach((k) => {
    g.beginPath();
    g.arc(P[k][0], P[k][1], 11, 0, 7);
    g.fill();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** One drum symbol panel, drawn on canvas (artifact symbolTexture). */
function symbolTexture(idx: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 160;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fdfbf2";
  g.fillRect(0, 0, 128, 160);
  g.strokeStyle = "rgba(20,33,61,.16)";
  g.lineWidth = 5;
  g.strokeRect(4, 4, 120, 152);
  g.textAlign = "center";
  g.textBaseline = "middle";
  if (idx === 0) {
    // Seven — navy, never red
    g.fillStyle = "#14213d";
    g.font = "900 104px Outfit, sans-serif";
    g.fillText("7", 64, 86);
  } else if (idx === 1) {
    // Emerald
    g.fillStyle = "#1fae5f";
    g.beginPath();
    g.moveTo(64, 26);
    g.lineTo(102, 62);
    g.lineTo(64, 138);
    g.lineTo(26, 62);
    g.closePath();
    g.fill();
    g.strokeStyle = "#0c6b38";
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(26, 62);
    g.lineTo(102, 62);
    g.moveTo(64, 26);
    g.lineTo(48, 62);
    g.lineTo(64, 138);
    g.moveTo(80, 62);
    g.lineTo(64, 26);
    g.stroke();
  } else if (idx === 2) {
    // Golden cherries
    g.strokeStyle = "#2e7d32";
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(84, 34);
    g.quadraticCurveTo(76, 66, 48, 88);
    g.moveTo(84, 34);
    g.quadraticCurveTo(88, 62, 90, 84);
    g.stroke();
    g.fillStyle = "#2e7d32";
    g.beginPath();
    g.ellipse(92, 30, 17, 9, 0.5, 0, 7);
    g.fill();
    g.fillStyle = "#d99a1f";
    g.beginPath();
    g.arc(44, 104, 24, 0, 7);
    g.fill();
    g.beginPath();
    g.arc(90, 110, 20, 0, 7);
    g.fill();
    g.fillStyle = "rgba(255,255,255,.5)";
    g.beginPath();
    g.arc(36, 96, 7, 0, 7);
    g.fill();
    g.beginPath();
    g.arc(83, 103, 6, 0, 7);
    g.fill();
  } else if (idx === 3) {
    // Coin
    g.fillStyle = "#f2c230";
    g.beginPath();
    g.arc(64, 80, 42, 0, 7);
    g.fill();
    g.strokeStyle = "#9a7410";
    g.lineWidth = 6;
    g.beginPath();
    g.arc(64, 80, 42, 0, 7);
    g.stroke();
    g.lineWidth = 3;
    g.beginPath();
    g.arc(64, 80, 33, 0, 7);
    g.stroke();
    g.fillStyle = "#7a5200";
    g.font = "900 52px Outfit, sans-serif";
    g.fillText("₵", 64, 84);
  } else if (idx === 4) {
    // Bell
    g.fillStyle = "#f2c230";
    g.beginPath();
    g.moveTo(64, 30);
    g.quadraticCurveTo(94, 34, 94, 74);
    g.quadraticCurveTo(94, 100, 106, 110);
    g.lineTo(22, 110);
    g.quadraticCurveTo(34, 100, 34, 74);
    g.quadraticCurveTo(34, 34, 64, 30);
    g.fill();
    g.strokeStyle = "#9a7410";
    g.lineWidth = 4;
    g.stroke();
    g.fillStyle = "#9a7410";
    g.beginPath();
    g.arc(64, 124, 11, 0, 7);
    g.fill();
  } else {
    // Clover
    g.fillStyle = "#2fbf71";
    [
      [48, 64],
      [80, 64],
      [48, 96],
      [80, 96],
    ].forEach((pt) => {
      g.beginPath();
      g.arc(pt[0], pt[1], 19, 0, 7);
      g.fill();
    });
    g.strokeStyle = "#1e8c4d";
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(64, 84);
    g.quadraticCurveTo(64, 116, 52, 136);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class HeroSlotScene {
  private stage: Stage;
  private camera: THREE.PerspectiveCamera;
  private rig = new THREE.Group();
  private clock = new THREE.Clock();
  private drums: Drum[] = [];
  private spinners: Spinner[] = [];
  private wheel = new THREE.Group();
  private ball: THREE.Mesh;
  private lever = new THREE.Group();
  private domeMat: THREE.MeshStandardMaterial;
  private dust: THREE.Points;
  private raf = 0;
  private last = 0;
  private tx = 0;
  private ty = 0;
  private px = 0;
  private py = 0;
  private spinDone: (() => void) | null = null;
  private leverPull = 0;
  private reduced: boolean;
  private disposed = false;
  private ro: ResizeObserver | null = null;
  private frameEl: HTMLElement | null;
  private view: HTMLElement;
  private onPointerMove: (e: PointerEvent) => void;
  private onPointerLeave: () => void;
  private onResize: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.reduced = prefersReducedMotion();
    this.view = canvas.parentElement as HTMLElement;
    this.frameEl =
      canvas.closest("#slotStage") as HTMLElement | null ||
      document.getElementById("slotStage");
    // The hero builds its own renderer/scene (artifact: NOT xgStage).
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    canvas.style.position = "relative";
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x070812, 13, 30);
    this.stage = { renderer, scene };

    scene.add(this.rig);
    this.camera = new THREE.PerspectiveCamera(38, 2.65, 0.1, 100);
    this.camera.position.set(0, 0.55, 7.6);
    this.rig.add(this.camera);

    scene.add(new THREE.HemisphereLight(0xffe9b0, 0x0a1a33, 0.55));
    scene.add(new THREE.AmbientLight(0x33415e, 0.5));
    const sun = new THREE.DirectionalLight(0xffe2a0, 1.35);
    sun.position.set(5, 9, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -9;
    sun.shadow.camera.right = 9;
    sun.shadow.camera.top = 8;
    sun.shadow.camera.bottom = -8;
    scene.add(sun);
    const spot = new THREE.SpotLight(0xffc94d, 0.9, 30, Math.PI / 5, 0.45);
    spot.position.set(-4, 8, 5);
    scene.add(spot);
    const glow = new THREE.PointLight(0x2dd4bf, 0.5, 16);
    glow.position.set(4.2, 1.4, 2.5);
    scene.add(glow);

    const MAT = {
      gold: new THREE.MeshStandardMaterial({
        color: 0xf2c230,
        metalness: 1.0,
        roughness: 0.28,
      }),
      goldSoft: new THREE.MeshStandardMaterial({
        color: 0xd99a1f,
        metalness: 0.95,
        roughness: 0.42,
      }),
      ivory: new THREE.MeshStandardMaterial({
        color: 0xfdfbf4,
        metalness: 0.05,
        roughness: 0.35,
      }),
      crimson: new THREE.MeshStandardMaterial({
        color: 0xb3232e,
        metalness: 0.2,
        roughness: 0.4,
      }),
      felt: new THREE.MeshStandardMaterial({
        color: 0x0c2b22,
        metalness: 0.0,
        roughness: 0.95,
      }),
      dark: new THREE.MeshStandardMaterial({
        color: 0x141828,
        metalness: 0.4,
        roughness: 0.5,
      }),
      black: new THREE.MeshStandardMaterial({
        color: 0x0a0d13,
        metalness: 0.3,
        roughness: 0.45,
      }),
      emerald: new THREE.MeshStandardMaterial({
        color: 0x12b981,
        metalness: 0.3,
        roughness: 0.3,
        emissive: 0x063d27,
      }),
    };

    const floor = new THREE.Mesh(new THREE.CircleGeometry(11, 48), MAT.felt);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.95;
    floor.receiveShadow = true;
    scene.add(floor);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5.4, 0.045, 10, 72), MAT.gold);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -1.93;
    scene.add(ring);

    const rand = mulberry(20261109);

    // Floating gold coins
    const coinGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.07, 28);
    for (let i = 0; i < 12; i++) {
      const coin = new THREE.Mesh(coinGeo, i % 3 ? MAT.gold : MAT.goldSoft);
      const side = i % 2 ? 1 : -1;
      coin.position.set(
        side * (2.6 + rand() * 3.6),
        -1.1 + rand() * 2.9,
        -0.6 + rand() * 1.4,
      );
      coin.rotation.set(rand() * 0.9, rand() * Math.PI, 0);
      coin.castShadow = true;
      scene.add(coin);
      this.spinners.push({
        obj: coin,
        sy: 0.9 + rand() * 1.6,
        bob: rand() * Math.PI * 2,
        y0: coin.position.y,
      });
    }

    // Tumbling dice with real pip faces
    const makeDie = (x: number, y: number, z: number) => {
      const mats = [1, 2, 3, 4, 5, 6].map(
        (n) =>
          new THREE.MeshStandardMaterial({
            map: dieTexture(n),
            roughness: 0.32,
            metalness: 0.05,
          }),
      );
      const die = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.66, 0.66), mats);
      die.position.set(x, y, z);
      die.castShadow = true;
      scene.add(die);
      this.spinners.push({
        obj: die,
        sx: 0.7,
        sz: 0.9,
        bob: rand() * Math.PI * 2,
        y0: y,
        tumble: true,
      });
    };
    makeDie(3.1, 0.9, 0.4);
    makeDie(-3.4, 1.5, 0.1);

    // Roulette wheel, stage left
    this.wheel.position.set(-4.7, -1.35, -1.1);
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(1.35, 1.44, 0.32, 40),
      MAT.goldSoft,
    );
    rim.castShadow = true;
    this.wheel.add(rim);
    for (let sg = 0; sg < 12; sg++) {
      const seg = new THREE.Mesh(
        new THREE.CylinderGeometry(
          1.15,
          1.15,
          0.1,
          6,
          1,
          false,
          (sg * Math.PI) / 6,
          Math.PI / 6,
        ),
        sg % 2 ? MAT.black : MAT.crimson,
      );
      seg.position.y = 0.19;
      this.wheel.add(seg);
    }
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.27, 20, 16), MAT.gold);
    hub.position.y = 0.4;
    hub.castShadow = true;
    this.wheel.add(hub);
    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 14, 12),
      MAT.ivory,
    );
    this.wheel.add(this.ball);
    scene.add(this.wheel);

    // The slot machine, centre stage
    const slotRig = new THREE.Group();
    slotRig.position.set(0, -0.42, 0);
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.7, 0.8), MAT.dark);
    body.castShadow = true;
    slotRig.add(body);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(2.66, 0.34, 0.88), MAT.gold);
    crown.position.y = 1.5;
    crown.castShadow = true;
    slotRig.add(crown);
    const frameM = new THREE.Mesh(new THREE.BoxGeometry(2.24, 1.24, 0.1), MAT.gold);
    frameM.position.set(0, 0.28, 0.42);
    slotRig.add(frameM);
    const windowM = new THREE.Mesh(
      new THREE.BoxGeometry(2.08, 1.08, 0.06),
      MAT.black,
    );
    windowM.position.set(0, 0.28, 0.47);
    slotRig.add(windowM);
    const tray = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 0.22, 0.5),
      MAT.goldSoft,
    );
    tray.position.set(0, -1.06, 0.55);
    slotRig.add(tray);

    // Drums: rings of symbol panels — panel i faces the camera exactly
    // when the drum's rotation.x equals its angle a_i.
    const panelGeo = new THREE.PlaneGeometry(0.46, 0.6);
    const coreGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.52, 24);
    coreGeo.rotateZ(Math.PI / 2);
    const symTex = [0, 1, 2, 3, 4, 5].map(symbolTexture);
    for (let ri = 0; ri < 3; ri++) {
      const drum = new THREE.Group();
      const core = new THREE.Mesh(coreGeo, MAT.dark);
      drum.add(core);
      for (let pi = 0; pi < 6; pi++) {
        const a = pi * SEG;
        const panel = new THREE.Mesh(
          panelGeo,
          new THREE.MeshStandardMaterial({
            map: symTex[pi],
            roughness: 0.5,
            metalness: 0.05,
          }),
        );
        panel.position.set(0, Math.sin(a) * RADIUS, Math.cos(a) * RADIUS);
        panel.rotation.x = -a;
        drum.add(panel);
      }
      drum.position.set(-0.68 + ri * 0.68, 0.28, 0.52);
      drum.rotation.x = ri * 0.7; // staggered rest positions
      slotRig.add(drum);
      this.drums.push({ grp: drum, anim: null });
    }
    this.domeMat = new THREE.MeshStandardMaterial({
      color: 0xffd964,
      emissive: 0x8a5a00,
      roughness: 0.3,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 12), this.domeMat);
    dome.position.set(0, 1.82, 0);
    slotRig.add(dome);
    const leverRod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.95, 8),
      MAT.goldSoft,
    );
    leverRod.position.y = 0.44;
    this.lever.add(leverRod);
    const leverKnob = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 14, 12),
      MAT.gold,
    );
    leverKnob.position.y = 0.95;
    this.lever.add(leverKnob);
    this.lever.position.set(1.38, 0.5, 0);
    slotRig.add(this.lever);
    scene.add(slotRig);

    // Chip stacks, stage right
    const chipStack = (
      x: number,
      z: number,
      heights: number[],
      mats: THREE.Material[],
    ) => {
      const grp = new THREE.Group();
      grp.position.set(x, -1.95, z);
      let n = 0;
      heights.forEach((count, ci) => {
        for (let k = 0; k < count; k++) {
          const chip = new THREE.Mesh(
            new THREE.CylinderGeometry(0.4, 0.4, 0.09, 24),
            mats[ci % mats.length],
          );
          chip.position.y = 0.06 + ++n * 0.095;
          chip.castShadow = true;
          grp.add(chip);
        }
      });
      scene.add(grp);
      return grp;
    };
    chipStack(3.6, 0.7, [5, 4], [MAT.crimson, MAT.ivory]);
    chipStack(4.5, 0.1, [6], [MAT.emerald]);
    chipStack(-3.2, 1.1, [4, 3], [MAT.gold, MAT.dark]);

    // Gold dust
    const pCount = 110;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(pCount * 3);
    for (let p = 0; p < pCount; p++) {
      pPos[p * 3] = (rand() - 0.5) * 12;
      pPos[p * 3 + 1] = -1.8 + rand() * 4.4;
      pPos[p * 3 + 2] = (rand() - 0.5) * 4;
    }
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
    this.dust = new THREE.Points(
      pGeo,
      new THREE.PointsMaterial({
        color: 0xffd964,
        size: 0.055,
        transparent: true,
        opacity: 0.85,
      }),
    );
    scene.add(this.dust);

    // Pointer parallax on the headline slot frame only
    this.onPointerMove = (e: PointerEvent) => {
      if (!this.frameEl) return;
      const r = this.frameEl.getBoundingClientRect();
      this.tx = ((e.clientX - r.left) / r.width - 0.5) * 0.35;
      this.ty = ((e.clientY - r.top) / r.height - 0.5) * 0.18;
    };
    this.onPointerLeave = () => {
      this.tx = 0;
      this.ty = 0;
    };
    if (this.frameEl) {
      this.frameEl.addEventListener("pointermove", this.onPointerMove);
      this.frameEl.addEventListener("pointerleave", this.onPointerLeave);
    }

    this.onResize = () => sizeStage(this.stage, this.camera, this.view);
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(this.onResize);
      this.ro.observe(this.view);
    }
    window.addEventListener("resize", this.onResize);
    this.onResize();

    if (this.reduced) {
      this.frame();
      return;
    }
    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Spin the drums to the given symbol indices, then call onDone. */
  spin(picks: [number, number, number], onDone?: () => void): void {
    this.leverPull = 1;
    if (this.reduced) {
      this.drums.forEach((d, i) => {
        d.grp.rotation.x = picks[i] * SEG;
      });
      this.frame();
      if (onDone) setTimeout(onDone, 80);
      return;
    }
    this.spinDone = onDone || null;
    const t = this.clock.getElapsedTime();
    this.drums.forEach((d, i) => {
      const from = d.grp.rotation.x;
      const target = picks[i] * SEG;
      const base =
        Math.ceil((from - target) / (Math.PI * 2) - 0.0001) * Math.PI * 2 +
        target;
      const to = base + Math.PI * 2 * (2 + i); // at least 2-4 full turns
      d.anim = { from, to, t0: t + i * 0.18, dur: 1.15 + i * 0.3 };
    });
  }

  private frame(): void {
    const t = this.clock.getElapsedTime();
    const dt = Math.min(0.05, t - this.last);
    this.last = t;
    this.px += (this.tx - this.px) * 0.05;
    this.py += (this.ty - this.py) * 0.05;
    this.rig.rotation.y = Math.sin(t * 0.1) * 0.05 + this.px;
    this.rig.rotation.x = this.py * 0.5;
    this.camera.position.y = 0.55 + Math.sin(t * 0.4) * 0.05;
    this.camera.lookAt(0, 0, 0);
    this.spinners.forEach((s) => {
      if (s.tumble) {
        s.obj.rotation.x = t * (s.sx || 0);
        s.obj.rotation.z = t * (s.sz || 0);
      } else {
        s.obj.rotation.y = t * (s.sy || 0);
      }
      s.obj.position.y = s.y0 + Math.sin(t * 1.4 + s.bob) * 0.12;
    });
    this.wheel.rotation.y = t * 0.5;
    const ba = -t * 1.6;
    this.ball.position.set(Math.cos(ba) * 1.22, 0.28, Math.sin(ba) * 1.22);
    let anyAnim = false;
    this.drums.forEach((d, i) => {
      if (d.anim) {
        anyAnim = true;
        const k = (t - d.anim.t0) / d.anim.dur;
        if (k < 0) return;
        if (k >= 1) {
          d.grp.rotation.x = d.anim.to;
          d.anim = null;
          return;
        }
        const e = 1 - Math.pow(1 - k, 4);
        d.grp.rotation.x = d.anim.from + (d.anim.to - d.anim.from) * e;
      } else {
        d.grp.rotation.x += dt * (0.22 + i * 0.06);
      }
    });
    if (!anyAnim && this.spinDone) {
      const cb = this.spinDone;
      this.spinDone = null;
      cb();
    }
    if (this.leverPull > 0)
      this.leverPull = Math.max(0, this.leverPull - dt * 1.3);
    this.lever.rotation.x =
      this.leverPull > 0 ? -Math.sin((1 - this.leverPull) * Math.PI) * 0.85 : 0;
    this.domeMat.emissiveIntensity =
      0.7 + Math.sin(t * 3.2) * 0.35 + (anyAnim ? 0.9 : 0);
    this.dust.rotation.y = t * 0.02;
    this.stage.renderer.render(this.stage.scene, this.camera);
  }

  dispose(): void {
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.ro) this.ro.disconnect();
    window.removeEventListener("resize", this.onResize);
    if (this.frameEl) {
      this.frameEl.removeEventListener("pointermove", this.onPointerMove);
      this.frameEl.removeEventListener("pointerleave", this.onPointerLeave);
    }
    disposeStage(this.stage);
  }
}
