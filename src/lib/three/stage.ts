// Shared Three.js stage — ported from the v48 artifact
// (~/workspace/your_files/casino-homepage/casino-homepage.html, script
// block "PLAYABLE 3D GAMES", xgEnvTexture / xgStage / xgSize / xgFeltDisc,
// original lines 5781-5839). Render layer only: no game logic, no wallet,
// no payouts. Every 3D scene in the port is built on this factory so the
// lighting, tone mapping and environment match the artifact exactly.
//
// r160 API notes: the artifact used the r160-era `outputEncoding` /
// `tex.encoding` spellings in some modules and the modern `outputColorSpace`
// / `colorSpace` spellings in others; this port uses the modern spellings
// everywhere (three@0.160.0, bundled — no CDN).

import * as THREE from "three";

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
}

export function isWebGLAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Deterministic PRNG (mulberry32) — the artifact's hero uses a seeded
 *  random so the floating coins/dice/dust sit in the same places. */
export function mulberry(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gold-glow equirectangular environment map (artifact xgEnvTexture). */
export function createEnvTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const x = c.getContext("2d")!;
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, "#2A3560");
  g.addColorStop(0.45, "#0A0F24");
  g.addColorStop(0.58, "#0C2B22");
  g.addColorStop(1, "#05070F");
  x.fillStyle = g;
  x.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 30; i++) {
    const rx = Math.random() * 1024;
    const ry = Math.random() * 210;
    const r = 14 + Math.random() * 38;
    const rg = x.createRadialGradient(rx, ry, 0, rx, ry, r);
    rg.addColorStop(0, "rgba(255,232,154,.95)");
    rg.addColorStop(1, "rgba(255,232,154,0)");
    x.fillStyle = rg;
    x.beginPath();
    x.arc(rx, ry, r, 0, 7);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Shared stage (artifact xgStage): ACES tone mapping, PCF soft shadows,
 *  hemisphere + shadow-casting sun + gold point light, env reflections. */
export function createStage(canvas: HTMLCanvasElement): Stage {
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
  const scene = new THREE.Scene();
  scene.environment = createEnvTexture();
  scene.add(new THREE.HemisphereLight(0xffe9b0, 0x0a1a33, 0.5));
  const sun = new THREE.DirectionalLight(0xffe2a0, 1.6);
  sun.position.set(5, 9, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -6;
  sun.shadow.camera.right = 6;
  sun.shadow.camera.top = 6;
  sun.shadow.camera.bottom = -6;
  sun.shadow.camera.far = 30;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  const glow = new THREE.PointLight(0xf2c230, 0.55, 26);
  glow.position.set(0, 3, 6);
  scene.add(glow);
  return { renderer, scene };
}

/** Size the renderer + camera from a box element's client box
 *  (artifact xgSize). */
export function sizeStage(
  stage: Stage,
  camera: THREE.PerspectiveCamera,
  box: HTMLElement,
): void {
  const w = box.clientWidth;
  const h = box.clientHeight;
  if (!w || !h) return;
  stage.renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

/** Green felt disc with a gold torus rim (artifact xgFeltDisc). */
export function createFeltDisc(r: number): THREE.Group {
  const grp = new THREE.Group();
  const felt = new THREE.Mesh(
    new THREE.CircleGeometry(r, 64),
    new THREE.MeshStandardMaterial({
      color: 0x0e3a2a,
      roughness: 0.96,
      metalness: 0,
    }),
  );
  felt.rotation.x = -Math.PI / 2;
  felt.receiveShadow = true;
  grp.add(felt);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(r, 0.07, 12, 90),
    new THREE.MeshStandardMaterial({
      color: 0xc99612,
      roughness: 0.32,
      metalness: 1,
    }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.02;
  grp.add(rim);
  return grp;
}

/** Dispose a scene graph: geometries, materials and their maps. */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    for (const m of mats) {
      const std = m as THREE.MeshStandardMaterial;
      if (std.map) std.map.dispose();
      if (std.envMap) std.envMap.dispose();
      m.dispose();
    }
  });
}

export function disposeStage(stage: Stage): void {
  disposeObject(stage.scene);
  const env = stage.scene.environment;
  if (env) (env as THREE.Texture).dispose();
  stage.renderer.dispose();
}
