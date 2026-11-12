// Dice Roll — genuine physics throw (#drGl) — ported from the v48
// artifact (casino-homepage.html, DiceGame IIFE, original lines
// 6051-6360). Two 3D gold dice (six pip CanvasTextures; material order
// [+x,-x,+y,-y,+z,-z] = values [1,6,2,5,3,4], opposites sum to 7) in a
// felt tray with wooden rails + gold trim, in the shared xgStage scene.
//
// Physics (verbatim): gravity 19, floor bounce restitution .42, ground
// friction, die-on-die push + impulse, snap-to-flat as a die slows,
// sleep after .38s still, 6500ms hard cap.
//
// ONE adaptation, documented: the artifact READ the result from the
// settled dice; the port decides the dice FIRST (at the click, as the
// port's DiceRoom does — the settle must match the decided values).
// The throw is still the same genuine physics, but the settle is
// GUIDED: as each die slows on the ground it flops onto the nearest
// flat orientation that has the decided value on top (guidedQuat —
// the artifact's own snapQuat, restricted to the four flat
// orientations with that face up, nearest to the current orientation).
// The dice therefore always land showing exactly the decided values,
// after a real tumble. onDone fires with the decided values.

import * as THREE from "three";
import {
  createStage,
  disposeStage,
  prefersReducedMotion,
  sizeStage,
  type Stage,
} from "./stage";

const HALF = 0.53;
const BOUND_X = 2.62;
const BOUND_Z = 1.58;
const GRAV = 19;

/** Material order [+x,-x,+y,-y,+z,-z] = values [1,6,2,5,3,4]. */
const FACES = [
  { v: 1, n: [1, 0, 0] as const },
  { v: 6, n: [-1, 0, 0] as const },
  { v: 2, n: [0, 1, 0] as const },
  { v: 5, n: [0, -1, 0] as const },
  { v: 3, n: [0, 0, 1] as const },
  { v: 4, n: [0, 0, -1] as const },
];

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function dieFaceTexture(v: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(88, 76, 20, 128, 128, 190);
  g.addColorStop(0, "#FFEFA8");
  g.addColorStop(0.55, "#F2C230");
  g.addColorStop(1, "#C99612");
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  x.strokeStyle = "rgba(122,82,0,.55)";
  x.lineWidth = 5;
  x.beginPath();
  const r = 30;
  const ix = 15;
  const iy = 15;
  const iw = 226;
  const ih = 226;
  x.moveTo(ix + r, iy);
  x.lineTo(ix + iw - r, iy);
  x.arcTo(ix + iw, iy, ix + iw, iy + r, r);
  x.lineTo(ix + iw, iy + ih - r);
  x.arcTo(ix + iw, iy + ih, ix + iw - r, iy + ih, r);
  x.lineTo(ix + r, iy + ih);
  x.arcTo(ix, iy + ih, ix, iy + ih - r, r);
  x.lineTo(ix, iy + r);
  x.arcTo(ix, iy, ix + r, iy, r);
  x.closePath();
  x.stroke();
  const pos = [58, 128, 198];
  PIPS[v].forEach((i) => {
    const px = pos[i % 3];
    const py = pos[Math.floor(i / 3)];
    const pg = x.createRadialGradient(px - 5, py - 6, 2, px, py, 20);
    pg.addColorStop(0, "#6B4A04");
    pg.addColorStop(1, "#382500");
    x.fillStyle = pg;
    x.beginPath();
    x.arc(px, py, 19, 0, 7);
    x.fill();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** The nearest flat (90-degree-grid) orientation to a quaternion —
 *  a real cube on flat felt always ends flat. */
function snapQuat(q: THREE.Quaternion): THREE.Quaternion {
  const e = new THREE.Matrix4().makeRotationFromQuaternion(q).elements;
  function snapDir(v: THREE.Vector3): THREE.Vector3 {
    const ax = Math.abs(v.x);
    const ay = Math.abs(v.y);
    const az = Math.abs(v.z);
    if (ax > ay && ax > az)
      return new THREE.Vector3(Math.sign(v.x) || 1, 0, 0);
    if (ay > az) return new THREE.Vector3(0, Math.sign(v.y) || 1, 0);
    return new THREE.Vector3(0, 0, Math.sign(v.z) || 1);
  }
  const c0 = snapDir(new THREE.Vector3(e[0], e[1], e[2]));
  let c1 = snapDir(new THREE.Vector3(e[4], e[5], e[6]));
  const c2 = new THREE.Vector3().crossVectors(c0, c1);
  c1 = new THREE.Vector3().crossVectors(c2, c0);
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(c0, c1, c2),
  );
}

/** Nearest flat orientation with `value` on top, to the current
 *  orientation — the guided settle (see module header). */
function guidedQuat(
  current: THREE.Quaternion,
  value: number,
): THREE.Quaternion {
  const face = FACES.find((f) => f.v === value)!;
  const n = new THREE.Vector3(face.n[0], face.n[1], face.n[2]);
  const up = new THREE.Vector3(0, 1, 0);
  const q0 = new THREE.Quaternion().setFromUnitVectors(n, up);
  let best: THREE.Quaternion | null = null;
  let bestAngle = Infinity;
  for (let k = 0; k < 4; k++) {
    const qy = new THREE.Quaternion().setFromAxisAngle(
      up,
      (k * Math.PI) / 2,
    );
    const cand = qy.multiply(q0);
    const angle =
      2 * Math.acos(Math.min(1, Math.abs(cand.dot(current))));
    if (angle < bestAngle) {
      bestAngle = angle;
      best = cand;
    }
  }
  return best!;
}

function topValue(mesh: THREE.Mesh): number {
  let best = 2;
  let bestY = -2;
  const up = new THREE.Vector3();
  FACES.forEach((f) => {
    up.set(f.n[0], f.n[1], f.n[2]).applyQuaternion(mesh.quaternion);
    if (up.y > bestY) {
      bestY = up.y;
      best = f.v;
    }
  });
  return best;
}

interface Die {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  angVel: THREE.Vector3;
  asleep: boolean;
  still: number;
  targetValue: number | null;
  targetQuat: THREE.Quaternion | null;
}

export class DiceScene {
  private stage: Stage;
  private cam: THREE.PerspectiveCamera;
  private dice: Die[] = [];
  private rolling = false;
  private rollStart = 0;
  private pendingTargets: [number, number] | null = null;
  private onDone: ((values: [number, number]) => void) | null = null;
  private raf = 0;
  private lastT = 0;
  private reduced: boolean;
  private disposed = false;
  private box: HTMLElement;
  private onResize: () => void;
  private n = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement) {
    this.reduced = prefersReducedMotion();
    this.box = canvas.parentElement as HTMLElement;
    const st = createStage(canvas);
    this.stage = st;
    this.cam = new THREE.PerspectiveCamera(42, 1.6, 0.1, 100);
    this.cam.position.set(0, 5.4, 6.6);
    this.cam.lookAt(0, 0, -0.1);

    const felt = new THREE.Mesh(
      new THREE.PlaneGeometry(6.8, 4.6),
      new THREE.MeshStandardMaterial({
        color: 0x0e3a2a,
        roughness: 0.96,
        metalness: 0,
      }),
    );
    felt.rotation.x = -Math.PI / 2;
    felt.receiveShadow = true;
    st.scene.add(felt);
    const wood = new THREE.MeshStandardMaterial({
      color: 0x2a1a06,
      roughness: 0.55,
      metalness: 0.25,
    });
    const trim = new THREE.MeshStandardMaterial({
      color: 0xc99612,
      roughness: 0.32,
      metalness: 1,
    });
    const rail = (w: number, d: number, px: number, pz: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.55, d), wood);
      m.position.set(px, 0.27, pz);
      m.castShadow = true;
      m.receiveShadow = true;
      st.scene.add(m);
      const t = new THREE.Mesh(
        new THREE.BoxGeometry(w === 0.34 ? 0.4 : w, 0.09, d === 0.34 ? 0.4 : d),
        trim,
      );
      t.position.set(px, 0.58, pz);
      st.scene.add(t);
    };
    rail(7.1, 0.34, 0, 2.3);
    rail(7.1, 0.34, 0, -2.3);
    rail(0.34, 4.95, 3.38, 0);
    rail(0.34, 4.95, -3.38, 0);

    const mats = [1, 6, 2, 5, 3, 4].map(
      (v) =>
        new THREE.MeshStandardMaterial({
          map: dieFaceTexture(v),
          metalness: 0.55,
          roughness: 0.42,
        }),
    );
    const geo = new THREE.BoxGeometry(1.06, 1.06, 1.06);
    this.dice = [0, 1].map((i) => {
      const mesh = new THREE.Mesh(geo, mats);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.set(i ? 1.15 : -1.15, HALF, i ? -0.25 : 0.25);
      mesh.quaternion.setFromEuler(
        new THREE.Euler(i ? Math.PI : 0, i ? 0.4 : 0.5, 0),
      );
      st.scene.add(mesh);
      return {
        mesh,
        vel: new THREE.Vector3(),
        angVel: new THREE.Vector3(),
        asleep: true,
        still: 0,
        targetValue: null,
        targetQuat: null,
      };
    });
    sizeStage(st, this.cam, this.box);

    this.onResize = () => sizeStage(this.stage, this.cam, this.box);
    window.addEventListener("resize", this.onResize);

    const loop = (t: number) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      this.frame(t);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Throw the dice; they settle showing `targets`, then onDone fires. */
  roll(
    targets: [number, number],
    onDone: (values: [number, number]) => void,
  ): void {
    this.pendingTargets = targets;
    this.onDone = onDone;
    if (this.reduced) {
      // Snap to flat orientations showing the decided values.
      this.dice.forEach((d, i) => {
        d.mesh.position.set(i ? 1.1 : -1.1, HALF, i ? -0.2 : 0.2);
        d.vel.set(0, 0, 0);
        d.angVel.set(0, 0, 0);
        d.asleep = true;
        d.mesh.quaternion.copy(
          guidedQuat(d.mesh.quaternion, targets[i]),
        );
      });
      const cb = this.onDone;
      this.onDone = null;
      if (cb) cb(targets);
      return;
    }
    this.throwDice();
  }

  private throwDice(): void {
    this.dice.forEach((d, i) => {
      const dir = i ? -1 : 1;
      d.mesh.position.set(
        -2.25 * dir,
        2.3 + i * 0.75,
        Math.random() * 1.1 - 0.55,
      );
      d.vel.set(
        dir * (3.1 + Math.random() * 1.5),
        0.7,
        (Math.random() * 2 - 1) * 1.7,
      );
      d.angVel.set(
        (Math.random() * 7 + 6) * (Math.random() < 0.5 ? -1 : 1),
        (Math.random() * 7 + 6) * (Math.random() < 0.5 ? -1 : 1),
        (Math.random() * 7 + 6) * (Math.random() < 0.5 ? -1 : 1),
      );
      d.mesh.quaternion.setFromEuler(
        new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3),
      );
      d.asleep = false;
      d.still = 0;
      d.targetValue = this.pendingTargets ? this.pendingTargets[i] : null;
      d.targetQuat = null;
    });
    this.rolling = true;
    this.rollStart = performance.now();
  }

  /** The die's settle target: guided to the decided value, else the
   *  artifact's plain nearest-flat snap. Computed once per throw, from
   *  the orientation the die has when it starts slowing. */
  private settleQuat(d: Die): THREE.Quaternion {
    if (d.targetValue != null) {
      if (!d.targetQuat)
        d.targetQuat = guidedQuat(d.mesh.quaternion, d.targetValue);
      return d.targetQuat;
    }
    return snapQuat(d.mesh.quaternion);
  }

  private stepDie(d: Die, dt: number): void {
    if (d.asleep) return;
    const m = d.mesh;
    d.vel.y -= GRAV * dt;
    m.position.addScaledVector(d.vel, dt);
    const w = d.angVel;
    const q = m.quaternion;
    const oq = new THREE.Quaternion(w.x, w.y, w.z, 0).multiply(q);
    q.set(
      q.x + 0.5 * dt * oq.x,
      q.y + 0.5 * dt * oq.y,
      q.z + 0.5 * dt * oq.z,
      q.w + 0.5 * dt * oq.w,
    ).normalize();
    let grounded = false;
    if (m.position.y < HALF) {
      m.position.y = HALF;
      if (d.vel.y < 0) {
        d.vel.y = -d.vel.y * 0.42;
        if (Math.abs(d.vel.y) < 1.1) d.vel.y = 0;
        d.angVel.x += d.vel.z * 0.3;
        d.angVel.z -= d.vel.x * 0.3;
      }
      grounded = d.vel.y === 0;
    }
    if (grounded) {
      const f = Math.max(0, 1 - 3.4 * dt);
      d.vel.x *= f;
      d.vel.z *= f;
      d.angVel.multiplyScalar(Math.max(0, 1 - 4.2 * dt));
      if (d.vel.lengthSq() < 1.4 && d.angVel.lengthSq() < 9) {
        m.quaternion.slerp(this.settleQuat(d), Math.min(1, dt * 11));
      }
    }
    if (m.position.x > BOUND_X) {
      m.position.x = BOUND_X;
      d.vel.x = -Math.abs(d.vel.x) * 0.5;
    } else if (m.position.x < -BOUND_X) {
      m.position.x = -BOUND_X;
      d.vel.x = Math.abs(d.vel.x) * 0.5;
    }
    if (m.position.z > BOUND_Z) {
      m.position.z = BOUND_Z;
      d.vel.z = -Math.abs(d.vel.z) * 0.5;
    } else if (m.position.z < -BOUND_Z) {
      m.position.z = -BOUND_Z;
      d.vel.z = Math.abs(d.vel.z) * 0.5;
    }
    if (m.position.y < HALF) m.position.y = HALF;
    if (grounded && d.vel.lengthSq() < 0.08 && d.angVel.lengthSq() < 0.6) {
      d.still += dt;
      if (d.still > 0.38) {
        d.asleep = true;
        d.vel.set(0, 0, 0);
        d.angVel.set(0, 0, 0);
        m.position.y = HALF;
        m.quaternion.copy(this.settleQuat(d));
      }
    } else {
      d.still = 0;
    }
  }

  private collidePair(a: Die, b: Die): void {
    const pa = a.mesh.position;
    const pb = b.mesh.position;
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const dz = pb.z - pa.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const min = 1.3;
    if (dist < 0.001 || dist >= min) return;
    this.n.set(dx / dist, dy / dist, dz / dist);
    const push = (min - dist) / 2;
    pa.addScaledVector(this.n, -push);
    pb.addScaledVector(this.n, push);
    const avn = a.vel.dot(this.n);
    const bvn = b.vel.dot(this.n);
    const imp = avn - bvn;
    if (imp > 0) {
      a.vel.addScaledVector(this.n, -imp * 0.62);
      b.vel.addScaledVector(this.n, imp * 0.62);
      a.angVel.multiplyScalar(0.8);
      b.angVel.multiplyScalar(0.8);
      if (imp > 0.5) {
        a.asleep = false;
        a.still = 0;
        b.asleep = false;
        b.still = 0;
      }
    }
  }

  private frame(t: number): void {
    const dt = Math.min(0.033, this.lastT ? (t - this.lastT) / 1000 : 0.016);
    this.lastT = t;
    if (this.rolling) {
      const sdt = dt / 2;
      for (let s = 0; s < 2; s++) {
        this.dice.forEach((d) => this.stepDie(d, sdt));
        this.collidePair(this.dice[0], this.dice[1]);
      }
      const allAsleep = this.dice.every((d) => d.asleep);
      if (allAsleep || performance.now() - this.rollStart > 6500) {
        if (!allAsleep) {
          this.dice.forEach((d) => {
            d.asleep = true;
            d.vel.set(0, 0, 0);
            d.angVel.set(0, 0, 0);
            if (d.mesh.position.y < HALF) d.mesh.position.y = HALF;
            d.mesh.quaternion.copy(this.settleQuat(d));
          });
        }
        this.rolling = false;
        const targets = this.pendingTargets as [number, number];
        // The dice now show the decided values by construction; read
        // them back as a sanity check (they must match).
        const read: [number, number] = [
          topValue(this.dice[0].mesh),
          topValue(this.dice[1].mesh),
        ];
        if (read[0] !== targets[0] || read[1] !== targets[1]) {
          console.warn(
            "[DiceScene] settled faces",
            read,
            "do not match decided",
            targets,
          );
        }
        const cb = this.onDone;
        this.onDone = null;
        this.pendingTargets = null;
        if (cb) cb(targets);
      }
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
