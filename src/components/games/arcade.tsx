// Arcade cash games — Car Crash (top-down driving, live rising odds,
// gold CASH OUT with live GH₵ value, coins +0.10x, near-miss +0.05x),
// Rocket Shooter (goals EASY 20→×2, MEDIUM 35→×3, HARD 50→×4; powerups;
// speed ramp ~+2% per destroy), Fruit Ninja (score goals 150→×2,
// 250→×3, 400→×4; powerups; coins; speed ramp).

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, fmtCash } from "../../lib/api";
import { GameDef } from "../../lib/games";
import { RoomShell, StakeChips, useGameRoom } from "./shared";
import { playSfx } from "../../lib/store";

// ---------------- Car Crash ----------------
// Top-down driving on a server-issued crash round: the run's odds grow
// on the shared crash curve (exp(0.00006 * elapsed) + coin/near-miss
// bonuses, cap ×50) and the run ends when the SERVER's round crashes —
// the client polls GET /api/games/crash/reveal, which stays shut until
// the curve reaches the server's point, then reveals seed + point.
// A collision ends the run early (stake lost) and the reveal is still
// fetched afterwards. Cash-outs settle with the roundId so the server
// re-checks the multiplier against the stored crash point.
interface CarReveal { serverSeed: string; clientSeed: string; nonce: number; crashPoint: number; hash: string }

// ---- Car Crash visuals (v48 artifact, ported to the 300×420 canvas) ----
// Physics/hitboxes are the port's own (obstacles 44×70, car 40×68,
// spawn 0.03/frame, uniform fall speed) — only the LOOK is restored:
// scrolling road, detailed cars with tilt, truck/van/moto bodies,
// roadside scenery, speed streaks, spinning coins, crash explosion.
const CC_W = 300, CC_H = 420, CC_ROADX = 29, CC_ROADW = 242;
const CC_LANES = [CC_ROADX + CC_ROADW / 6, CC_ROADX + CC_ROADW / 2, CC_ROADX + 5 * CC_ROADW / 6];
const CC_CAR_Y = CC_H - 90;
const CC_COLS = ["#3E7CB1", "#C0C6D4", "#35C26E", "#B7791F", "#7A4FD0", "#C2504A"];
interface CcObstacle { x: number; y: number; w: number; h: number; kind: string; col: string; nm?: boolean }
interface CcCoin { x: number; y: number; spin: number }
interface CcScenery { side: number; x: number; y: number; k: string; s: number }
interface CcStreak { x: number; y: number; len: number; spd: number }
interface CcPart { x: number; y: number; vx: number; vy: number; life: number; r: number }
interface CcFtext { x: number; y: number; txt: string; col: string; life: number }
interface CcState {
  x: number; tx: number; tilt: number; speed: number;
  obstacles: CcObstacle[]; coins: CcCoin[]; dist: number; bonus: number;
  crashed: boolean; crashT: number; pendingReveal: CarReveal | null; settled: boolean;
  t0: number; tSurv: number; scroll: number;
  scenery: CcScenery[]; streaks: CcStreak[]; cparts: CcPart[]; ftexts: CcFtext[];
  shake: number; spawnT: number; coinT: number; scenT: number;
}

function ccRr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function ccShadow(g: CanvasRenderingContext2D, w: number, h: number) {
  g.fillStyle = "rgba(0,0,0,.38)"; g.beginPath(); g.ellipse(3, h / 2 * 0.82, w * 0.56, h * 0.52, 0, 0, 7); g.fill();
}
function ccWheels(g: CanvasRenderingContext2D, w: number, h: number, hub: boolean) {
  const hw = w / 2, hh = h / 2;
  [[-hw + 1, -hh + 6], [hw - 5, -hh + 6], [-hw + 1, hh - 15], [hw - 5, hh - 15]].forEach(([px, py]) => {
    g.fillStyle = "#0B0D14"; ccRr(g, px, py, 4, 9, 2); g.fill();
    if (hub) { g.fillStyle = "#8A8F7C"; g.fillRect(px + 1.5, py + 2.5, 1.5, 4); }
  });
}
/* Detailed top-down car: shaded body, windshield, roof, lights, stripe.
   up=true is the player's direction of travel; obstacles rotate PI. */
function drawCcCarBody(g: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, col: string, up: boolean, tilt: number, isPlayer: boolean) {
  g.save(); g.translate(cx, cy); if (!up) g.rotate(Math.PI);
  if (isPlayer) g.rotate(tilt);
  ccShadow(g, w, h);
  ccWheels(g, w, h, true);
  const hw = w / 2, hh = h / 2;
  if (isPlayer) {
    const beam = g.createLinearGradient(0, -hh, 0, -hh - 46);
    beam.addColorStop(0, "rgba(255,232,154,.30)"); beam.addColorStop(1, "rgba(255,232,154,0)");
    g.fillStyle = beam;
    g.beginPath(); g.moveTo(-hw + 3, -hh); g.lineTo(-hw - 3.5, -hh - 46); g.lineTo(-hw + 8.5, -hh - 46); g.lineTo(-hw + 6.5, -hh); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(hw - 6.5, -hh); g.lineTo(hw - 8.5, -hh - 46); g.lineTo(hw + 3.5, -hh - 46); g.lineTo(hw - 3, -hh); g.closePath(); g.fill();
  }
  const bg = g.createLinearGradient(-hw, 0, hw, 0);
  bg.addColorStop(0, col); bg.addColorStop(0.28, "#FFFFFF"); bg.addColorStop(0.5, col); bg.addColorStop(1, col);
  g.globalAlpha = 0.5; g.fillStyle = bg; ccRr(g, -hw, -hh, w, h, 6); g.fill(); g.globalAlpha = 1;
  g.fillStyle = col; ccRr(g, -hw + 1, -hh + 1, w - 2, h - 2, 5); g.fill();
  g.fillStyle = "rgba(255,255,255,.20)"; ccRr(g, -hw + 2.5, -hh + 2.5, w * 0.3, h - 5, 4); g.fill();
  g.fillStyle = "rgba(0,0,0,.16)"; ccRr(g, hw - w * 0.3 - 1.5, -hh + 2.5, w * 0.3, h - 5, 4); g.fill();
  const wg = g.createLinearGradient(0, -hh + h * 0.24, 0, -hh + h * 0.42);
  wg.addColorStop(0, "#CFEAFB"); wg.addColorStop(1, "#5E93B8");
  g.fillStyle = wg; ccRr(g, -hw + 3.5, -hh + h * 0.25, w - 7, h * 0.15, 2.5); g.fill();
  g.fillStyle = isPlayer ? "#8F1712" : col; ccRr(g, -hw + 3, -hh + h * 0.43, w - 6, h * 0.26, 3); g.fill();
  g.fillStyle = "rgba(255,255,255,.25)"; ccRr(g, -hw + 4.5, -hh + h * 0.455, w - 9, h * 0.07, 2); g.fill();
  if (isPlayer) { g.fillStyle = "#F2C230"; g.fillRect(-1.5, -hh + h * 0.43, 3, h * 0.26); }
  g.fillStyle = "#20303F"; ccRr(g, -hw + 4, hh - h * 0.235, w - 8, h * 0.1, 2); g.fill();
  g.fillStyle = col; g.fillRect(-hw - 1.5, -hh + h * 0.3, 2.5, 4); g.fillRect(hw - 1, -hh + h * 0.3, 2.5, 4);
  g.fillStyle = "#FFF3BF"; g.beginPath(); g.arc(-hw + 4.5, -hh + 2, 1.8, 0, 7); g.arc(hw - 4.5, -hh + 2, 1.8, 0, 7); g.fill();
  g.fillStyle = "#FF5A52"; ccRr(g, -hw + 2.5, hh - 2.75, 4.5, 1.8, 0.75); g.fill(); ccRr(g, hw - 7, hh - 2.75, 4.5, 1.8, 0.75); g.fill();
  if (isPlayer) { g.fillStyle = "#F2C230"; ccRr(g, -hw + 0.5, hh - 1.75, w - 1, 2.5, 1); g.fill(); }
  g.restore();
}
function drawCcTruck(g: CanvasRenderingContext2D, o: CcObstacle) {
  g.save(); g.translate(o.x, o.y);
  ccShadow(g, o.w, o.h); ccWheels(g, o.w, o.h, true);
  const hw = o.w / 2, hh = o.h / 2;
  const tg = g.createLinearGradient(-hw, 0, hw, 0);
  tg.addColorStop(0, "#B9BECB"); tg.addColorStop(0.5, "#EDF0F6"); tg.addColorStop(1, "#B9BECB");
  g.fillStyle = tg; ccRr(g, -hw, -hh, o.w, o.h * 0.68, 3); g.fill();
  g.strokeStyle = "rgba(20,33,61,.25)"; g.lineWidth = 1;
  for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(-hw + 2, -hh + o.h * 0.68 * i / 5); g.lineTo(hw - 2, -hh + o.h * 0.68 * i / 5); g.stroke(); }
  g.fillStyle = "#F2C230"; g.fillRect(-hw + 3, -hh + o.h * 0.3, o.w - 6, 3.5);
  g.fillStyle = "#14213D"; g.fillRect(-hw + 2.5, -hh + o.h * 0.68 - 6, o.w - 5, 2.5);
  g.fillStyle = o.col; ccRr(g, -hw + 1.5, hh - o.h * 0.30, o.w - 3, o.h * 0.30, 4); g.fill();
  g.fillStyle = "rgba(255,255,255,.22)"; ccRr(g, -hw + 3, hh - o.h * 0.29, o.w * 0.3, o.h * 0.26, 3); g.fill();
  const wg2 = g.createLinearGradient(0, hh - o.h * 0.24, 0, hh - o.h * 0.15);
  wg2.addColorStop(0, "#CFEAFB"); wg2.addColorStop(1, "#5E93B8");
  g.fillStyle = wg2; ccRr(g, -hw + 4.5, hh - o.h * 0.235, o.w - 9, o.h * 0.085, 2); g.fill();
  g.fillStyle = "#FFF3BF"; g.beginPath(); g.arc(-hw + 5, hh - 2, 1.7, 0, 7); g.arc(hw - 5, hh - 2, 1.7, 0, 7); g.fill();
  g.restore();
}
function drawCcVan(g: CanvasRenderingContext2D, o: CcObstacle) {
  g.save(); g.translate(o.x, o.y);
  ccShadow(g, o.w, o.h); ccWheels(g, o.w, o.h, true);
  const hw = o.w / 2, hh = o.h / 2;
  const vg = g.createLinearGradient(-hw, 0, hw, 0);
  vg.addColorStop(0, o.col); vg.addColorStop(0.5, "#FFFFFF"); vg.addColorStop(1, o.col);
  g.globalAlpha = 0.45; g.fillStyle = vg; ccRr(g, -hw, -hh, o.w, o.h, 6); g.fill(); g.globalAlpha = 1;
  g.fillStyle = o.col; ccRr(g, -hw + 1, -hh + 1, o.w - 2, o.h - 2, 5); g.fill();
  g.fillStyle = "rgba(255,255,255,.18)"; ccRr(g, -hw + 2.5, -hh + 3, o.w - 5, o.h * 0.26, 4); g.fill();
  g.fillStyle = "#20303F"; ccRr(g, -hw + 3.5, -hh + o.h * 0.2, o.w - 7, o.h * 0.15, 2.5); g.fill();
  g.fillStyle = "#9FD4F2";
  g.fillRect(-hw + 3.5, -hh + o.h * 0.2, (o.w - 7) / 3, o.h * 0.15);
  g.fillRect(0, -hh + o.h * 0.2, (o.w - 7) / 3 - 1, o.h * 0.15);
  const wg3 = g.createLinearGradient(0, hh - o.h * 0.3, 0, hh - o.h * 0.18);
  wg3.addColorStop(0, "#CFEAFB"); wg3.addColorStop(1, "#5E93B8");
  g.fillStyle = wg3; ccRr(g, -hw + 3.5, hh - o.h * 0.30, o.w - 7, o.h * 0.12, 2.5); g.fill();
  g.fillStyle = "#FFF3BF"; g.beginPath(); g.arc(-hw + 4.5, hh - 2, 1.6, 0, 7); g.arc(hw - 4.5, hh - 2, 1.6, 0, 7); g.fill();
  g.fillStyle = "#FF5A52"; ccRr(g, -hw + 2.5, -hh + 1, 4, 1.7, 0.75); g.fill(); ccRr(g, hw - 6.5, -hh + 1, 4, 1.7, 0.75); g.fill();
  g.restore();
}
function drawCcMoto(g: CanvasRenderingContext2D, o: CcObstacle) {
  // Narrow bike drawn inside the port's 44×70 hitbox (visual only).
  g.save(); g.translate(o.x, o.y);
  g.fillStyle = "rgba(0,0,0,.35)"; g.beginPath(); g.ellipse(1, 2, 5, o.h * 0.25, 0, 0, 7); g.fill();
  g.fillStyle = "#0B0D14";
  g.beginPath(); g.ellipse(0, -o.h * 0.32, 2.3, 4.5, 0, 0, 7); g.fill();
  g.beginPath(); g.ellipse(0, o.h * 0.32, 2.3, 4.5, 0, 0, 7); g.fill();
  g.fillStyle = "#C0C6D4"; g.beginPath(); g.arc(0, -o.h * 0.32, 1, 0, 7); g.arc(0, o.h * 0.32, 1, 0, 7); g.fill();
  g.fillStyle = "#232733"; ccRr(g, -2.5, -o.h * 0.3, 5, o.h * 0.6, 2.5); g.fill();
  g.fillStyle = o.col; ccRr(g, -4, -o.h * 0.06, 8, o.h * 0.3, 3); g.fill();
  g.fillStyle = "#FFF3BF"; g.beginPath(); g.arc(0, o.h * 0.46, 1.4, 0, 7); g.fill();
  g.fillStyle = "#14213D"; g.beginPath(); g.ellipse(0, o.h * 0.05, 4.25, 6.5, 0, 0, 7); g.fill();
  g.fillStyle = "#F2C230"; g.beginPath(); g.arc(0, o.h * 0.22, 3.2, 0, 7); g.fill();
  g.fillStyle = "#9FD4F2"; g.fillRect(-3, o.h * 0.22 + 0.5, 6, 1.5);
  g.restore();
}
function drawCcObstacle(g: CanvasRenderingContext2D, o: CcObstacle) {
  if (o.kind === "truck") drawCcTruck(g, o);
  else if (o.kind === "van") drawCcVan(g, o);
  else if (o.kind === "moto") drawCcMoto(g, o);
  else drawCcCarBody(g, o.x, o.y, o.w, o.h, o.col, false, 0, false);
}
function drawCcScenery(g: CanvasRenderingContext2D, s: CcScenery) {
  g.save(); g.translate(s.x, s.y); g.scale(s.s, s.s);
  if (s.k === "tree") {
    g.fillStyle = "#5E3A16"; g.fillRect(-1.25, 1, 2.5, 6);
    g.fillStyle = "#17503C"; g.beginPath(); g.arc(0, -2, 6.5, 0, 7); g.fill();
    g.fillStyle = "#1E7A52"; g.beginPath(); g.arc(-3, 0.5, 4.5, 0, 7); g.arc(3, 0.5, 4.5, 0, 7); g.fill();
    g.fillStyle = "rgba(255,255,255,.14)"; g.beginPath(); g.arc(-2, -4, 2.5, 0, 7); g.fill();
  } else if (s.k === "bush") {
    g.fillStyle = "#14402F"; g.beginPath(); g.ellipse(0, 0, 6.5, 4, 0, 0, 7); g.fill();
    g.fillStyle = "#1E7A52"; g.beginPath(); g.ellipse(-2, -1.5, 4, 2.5, 0, 0, 7); g.fill();
  } else if (s.k === "sign") {
    g.fillStyle = "#8A8F7C"; g.fillRect(-0.75, -1, 1.5, 8);
    g.fillStyle = "#F08A1D"; g.save(); g.translate(0, -4.5); g.rotate(Math.PI / 4); g.fillRect(-3.5, -3.5, 7, 7); g.restore();
    g.fillStyle = "#14213D"; g.beginPath(); g.moveTo(-1.7, -6.5); g.lineTo(1, -4.5); g.lineTo(-1.7, -2.5); g.lineTo(-0.7, -4.5); g.closePath(); g.fill();
  } else {
    g.fillStyle = "#C22828"; g.beginPath(); g.moveTo(-4.5, -4); g.lineTo(0, 0); g.lineTo(-4.5, 4); g.lineTo(-2, 4); g.lineTo(2.5, 0); g.lineTo(-2, -4); g.closePath(); g.fill();
    g.fillStyle = "#FDFBF2"; g.beginPath(); g.moveTo(0.5, -4); g.lineTo(5, 0); g.lineTo(0.5, 4); g.lineTo(3, 4); g.lineTo(7.5, 0); g.lineTo(3, -4); g.closePath(); g.fill();
  }
  g.restore();
}
function drawCcCoin(g: CanvasRenderingContext2D, c: CcCoin) {
  const sq = 0.3 + 0.7 * Math.abs(Math.cos(c.spin));
  g.save(); g.translate(c.x, c.y);
  g.shadowColor = "rgba(242,194,48,.85)"; g.shadowBlur = 6;
  g.scale(sq, 1);
  const cg = g.createRadialGradient(-2, -2.5, 1, 0, 0, 7.5);
  cg.addColorStop(0, "#FFEFA8"); cg.addColorStop(0.6, "#F2C230"); cg.addColorStop(1, "#C99612");
  g.fillStyle = cg; g.beginPath(); g.arc(0, 0, 7, 0, 7); g.fill();
  g.shadowBlur = 0;
  g.strokeStyle = "#9A7410"; g.lineWidth = 1; g.beginPath(); g.arc(0, 0, 7, 0, 7); g.stroke();
  g.strokeStyle = "rgba(154,116,16,.75)"; g.lineWidth = 0.7; g.setLineDash([1.5, 1.5]); g.beginPath(); g.arc(0, 0, 4.75, 0, 7); g.stroke(); g.setLineDash([]);
  if (sq > 0.55) { g.fillStyle = "#8A5E06"; g.font = "900 8px Outfit, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("₵", 0, 0.5); }
  g.restore();
}
function drawCcScene(g: CanvasRenderingContext2D, st: CcState) {
  const W = CC_W, H = CC_H;
  g.save();
  if (st.shake > 0) g.translate((Math.random() - 0.5) * st.shake, (Math.random() - 0.5) * st.shake);
  const gr = g.createLinearGradient(0, 0, W, 0);
  gr.addColorStop(0, "#0A241B"); gr.addColorStop(0.5, "#14402F"); gr.addColorStop(1, "#0A241B");
  g.fillStyle = gr; g.fillRect(-20, -20, W + 40, H + 40);
  st.scenery.forEach((s) => drawCcScenery(g, s));
  g.fillStyle = "#22262F"; g.fillRect(CC_ROADX, -20, CC_ROADW, H + 40);
  g.fillStyle = "rgba(255,255,255,.032)";
  const band = 46, off = st.scroll % band;
  for (let y = -band + off - 10; y < H + 10; y += band) g.fillRect(CC_ROADX, y, CC_ROADW, 21);
  // Tyre-wear bands along the wheel tracks + asphalt speckle, both
  // scrolling with the road (deterministic per-dot offsets, so the
  // texture never shimmers frame to frame).
  g.fillStyle = "rgba(0,0,0,.09)";
  g.fillRect(CC_ROADX + CC_ROADW * 0.22, -20, 22, H + 40);
  g.fillRect(CC_ROADX + CC_ROADW * 0.68, -20, 22, H + 40);
  for (let i = 0; i < 46; i++) {
    const dx = CC_ROADX + ((i * 53) % CC_ROADW);
    const dy = (((i * 97) % (H + 40)) + st.scroll) % (H + 40) - 20;
    g.fillStyle = i % 3 ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.12)";
    g.fillRect(dx, dy, 2, 2);
  }
  // Grass speckle on the shoulders, scrolling with the road.
  for (let i = 0; i < 26; i++) {
    const gx = i % 2 ? (i * 37) % CC_ROADX : CC_ROADX + CC_ROADW + ((i * 41) % (W - CC_ROADX - CC_ROADW));
    const gy = (((i * 113) % (H + 40)) + st.scroll) % (H + 40) - 20;
    g.fillStyle = i % 3 ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.14)";
    g.fillRect(gx, gy, 2, 2);
  }
  // Scrolling red/white kerbs + gold edge lines.
  const kb = 19, koff = st.scroll % (kb * 2);
  for (let ky = -kb * 2 + koff; ky < H + kb; ky += kb) {
    const alt = Math.round((ky - koff) / kb) % 2 === 0;
    g.fillStyle = alt ? "rgba(194,40,40,.85)" : "rgba(253,251,242,.8)";
    g.fillRect(CC_ROADX - 4.5, ky, 3, kb - 1.5); g.fillRect(CC_ROADX + CC_ROADW + 1.5, ky, 3, kb - 1.5);
  }
  g.fillStyle = "#F2C230"; g.fillRect(CC_ROADX - 1, -20, 1.5, H + 40); g.fillRect(CC_ROADX + CC_ROADW - 0.5, -20, 1.5, H + 40);
  // Scrolling lane dashes — these MUST move with st.scroll.
  g.fillStyle = "rgba(255,246,216,.7)";
  const dash = 31, dof = st.scroll % (dash * 2);
  [CC_ROADX + CC_ROADW / 3, CC_ROADX + 2 * CC_ROADW / 3].forEach((lx) => { for (let yy = -dash * 2 + dof; yy < H; yy += dash * 2) g.fillRect(lx - 1.5, yy, 3, dash); });
  // Speed streaks.
  g.strokeStyle = "rgba(255,255,255,.20)"; g.lineWidth = 1.5; g.lineCap = "round";
  st.streaks.forEach((s) => { g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(s.x, s.y + s.len); g.stroke(); });
  st.coins.forEach((c) => drawCcCoin(g, c));
  st.obstacles.forEach((ob) => drawCcObstacle(g, ob));
  if (!st.crashed) drawCcCarBody(g, st.x, CC_CAR_Y, 40, 68, "#C22828", true, st.tilt, true);
  st.cparts.forEach((p) => { g.globalAlpha = Math.max(0, p.life * 2.2); g.fillStyle = "#F2C230"; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); });
  g.globalAlpha = 1;
  st.ftexts.forEach((t) => { g.globalAlpha = Math.max(0, t.life * 1.6); g.fillStyle = t.col; g.font = "900 9px ui-monospace, Menlo, monospace"; g.textAlign = "center"; g.fillText(t.txt, t.x, t.y); });
  g.globalAlpha = 1;
  if (st.crashed) {
    // Explosion starburst at the wreck (v48) + red wash.
    g.save(); g.translate(st.x, CC_CAR_Y - 5);
    g.strokeStyle = "#FFD964"; g.lineWidth = 2; g.lineCap = "round";
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * 8, Math.sin(a) * 8); g.lineTo(Math.cos(a) * 22, Math.sin(a) * 22); g.stroke(); }
    g.fillStyle = "rgba(240,138,29,.85)"; g.beginPath(); g.arc(0, 0, 10.5, 0, 7); g.fill();
    g.fillStyle = "rgba(229,50,45,.9)"; g.beginPath(); g.arc(0, 0, 6.5, 0, 7); g.fill();
    g.restore();
    g.fillStyle = "rgba(229,50,45,0.18)"; g.fillRect(-20, -20, W + 40, H + 40);
  }
  g.restore();
}

export function CarCrashRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(10);
  const [playing, setPlaying] = useState(false);
  const [msg, setMsg] = useState("Steer with the arrow keys or drag. The multiplier climbs as you drive — cash out before you crash.");
  const [odds, setOdds] = useState(1);
  const [coins, setCoins] = useState(0);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [reveal, setReveal] = useState<CarReveal | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<CcState | null>(null);
  const rafRef = useRef(0);
  const keysRef = useRef<{ l: boolean; r: boolean }>({ l: false, r: false });
  const dragRef = useRef(false);
  const lastDriveRef = useRef(-1);
  const [crashInfo, setCrashInfo] = useState<{ point: number; coins: number } | null>(null);
  const [drive, setDrive] = useState({ t: 0, d: 0, v: 0 });
  const [flash, setFlash] = useState<{ txt: string; n: number } | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roundIdRef = useRef<string | null>(null);
  roundIdRef.current = roundId;
  // beginCrashFx has [] deps, so it would capture a stale `muted` —
  // mirror Plinko's mutedRef pattern.
  const mutedRef = useRef(room.muted);
  mutedRef.current = room.muted;

  // v48 flash banner (NEAR MISS / COIN pops). Infrequent setState only.
  const showFlash = useCallback((txt: string) => {
    setFlash({ txt, n: Date.now() });
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlash(null), 980);
  }, []);

  // Crash sequence: freeze the run, play the explosion (particles +
  // shake + flash) for ~900ms, THEN settle. The old code cancelled the
  // loop on impact so a crash was just a frozen frame.
  const beginCrashFx = useCallback((rv?: CarReveal) => {
    const st = stateRef.current;
    if (!st || st.settled) return;
    if (st.crashed) { if (rv && !st.pendingReveal) st.pendingReveal = rv; return; }
    st.crashed = true;
    st.crashT = Date.now();
    if (rv) st.pendingReveal = rv;
    st.shake = 14;
    // Impact thud at the crash; the settle below adds the lose groan.
    playSfx("boom", mutedRef.current);
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 5;
      st.cparts.push({ x: st.x, y: CC_CAR_Y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 0.5 + Math.random() * 0.4, r: 2 + Math.random() * 3 });
    }
  }, []);

  const fetchReveal = useCallback(async (waitMs = 0): Promise<CarReveal | null> => {
    const id = roundIdRef.current;
    if (!id) return null;
    try {
      const res = await fetch(`/api/games/crash/reveal?roundId=${encodeURIComponent(id)}${waitMs ? `&waitMs=${waitMs}` : ""}`);
      if (!res.ok) return null;
      const data = await res.json();
      if (data.finished === false) return null;
      return data as CarReveal;
    } catch {
      return null;
    }
  }, []);

  // After a run ends, keep asking until the server seed + point land.
  const revealAfterEnd = useCallback(async () => {
    for (let i = 0; i < 10; i++) {
      const rv = await fetchReveal(25000);
      if (rv) { setReveal(rv); return rv; }
    }
    return null;
  }, [fetchReveal]);

  const cashOut = useCallback(async () => {
    const st = stateRef.current;
    if (!st || !playing || st.crashed) return;
    cancelAnimationFrame(rafRef.current);
    setPlaying(false);
    const payout = Math.round(stake * odds * 100) / 100;
    setMsg(`Cashed out at ×${odds.toFixed(2)} — ${fmtCash(payout)}!`);
    playSfx("blip", mutedRef.current);
    await room.settle(stake, payout, { odds, coins, dist: Math.round(st.dist) }, roundIdRef.current || undefined);
    void revealAfterEnd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, odds, stake, coins, room, revealAfterEnd]);

  const crash = useCallback(async (rv?: CarReveal) => {
    const st = stateRef.current;
    if (!st || st.settled) return;
    st.settled = true;
    cancelAnimationFrame(rafRef.current);
    setPlaying(false);
    setCrashInfo({ point: rv?.crashPoint ?? odds, coins });
    if (rv !== undefined) {
      setReveal(rv);
      setOdds(rv.crashPoint);
      setMsg(`CRASH at ×${rv.crashPoint.toFixed(2)} — the server round crashed. The stake is gone.`);
    } else {
      setMsg(`CRASH at ×${odds.toFixed(2)} — the stake is gone.`);
    }
    await room.settle(stake, 0, { odds: rv?.crashPoint ?? odds, coins, dist: Math.round(st.dist), crashed: true }, roundIdRef.current || undefined);
    if (!rv) void revealAfterEnd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [odds, stake, coins, room, revealAfterEnd]);

  const start = async () => {
    if (room.balance < stake) { setMsg("Balance too low for that stake."); return; }
    // Server round: the run's crash point lives on the server.
    let startsAt = Date.now();
    try {
      const r = await api<{ roundId: string; startsAt: number }>("/api/games/crash/round", { method: "POST" });
      setRoundId(r.roundId);
      startsAt = r.startsAt;
    } catch {
      setMsg("Could not start a server round — log in and check your connection, then try again.");
      return;
    }
    setReveal(null);
    setCrashInfo(null);
    setDrive({ t: 0, d: 0, v: 0 });
    const st: CcState = {
      x: 150, tx: 150, tilt: 0, speed: 3, obstacles: [], coins: [], dist: 0, bonus: 0,
      crashed: false, crashT: 0, pendingReveal: null, settled: false,
      t0: startsAt, tSurv: 0, scroll: 0, scenery: [], streaks: [], cparts: [], ftexts: [],
      shake: 0, spawnT: 1.4, coinT: 1.1, scenT: 0,
    };
    stateRef.current = st;
    spawnObstacle(st, -215);
    spawnObstacle(st, -395);
    for (let i = 0; i < 7; i++) { spawnScenery(st); st.scenery[st.scenery.length - 1].y = Math.random() * CC_H; }
    setOdds(1); setCoins(0); setPlaying(true);
    setMsg("Drive! Steer with ← → or drag.");
  };

  // Spawners (v48 shapes, port pacing: obstacle 0.03/frame is kept in
  // the loop; these only place things). Obstacle hitboxes stay 44×70.
  const spawnObstacle = (st: CcState, atY?: number) => {
    const TYPES = [
      { k: "truck", w: 0.20 }, { k: "car", w: 0.36 }, { k: "van", w: 0.26 }, { k: "moto", w: 0.18 },
    ];
    let r = Math.random(), kind = "car";
    for (const t of TYPES) { if (r <= t.w) { kind = t.k; break; } r -= t.w; }
    for (let tries = 0; tries < 3; tries++) {
      const x = CC_LANES[Math.floor(Math.random() * 3)] + (Math.random() * 18 - 9);
      const clash = st.obstacles.some((o) => o.y < 70 + 70 && Math.abs(o.x - x) < (o.w + 44) / 2 + 8);
      if (!clash) {
        st.obstacles.push({ x, y: atY !== undefined ? atY : -80, w: 44, h: 70, kind, col: CC_COLS[Math.floor(Math.random() * CC_COLS.length)] });
        return;
      }
    }
  };
  const spawnCoinAt = (st: CcState, aheadOfCar: boolean) => {
    let x: number;
    if (aheadOfCar) x = st.x;
    else if (st.obstacles.length && Math.random() < 0.45) {
      const o = st.obstacles[Math.floor(Math.random() * st.obstacles.length)];
      let best = 0, bd = 1e9;
      CC_LANES.forEach((lx, i) => { const d = Math.abs(lx - o.x); if (d < bd) { bd = d; best = i; } });
      x = CC_LANES[best] + (Math.random() * 18 - 9);
    } else x = CC_LANES[Math.floor(Math.random() * 3)] + (Math.random() * 18 - 9);
    st.coins.push({ x, y: aheadOfCar ? CC_CAR_Y - 90 : -13, spin: Math.random() * 3 });
  };
  const spawnScenery = (st: CcState) => {
    const side = Math.random() < 0.5 ? 0 : 1;
    const kinds = ["tree", "tree", "sign", "bush", "chev"];
    st.scenery.push({
      side,
      x: side ? CC_ROADX + CC_ROADW + 11 + Math.random() * (CC_W - CC_ROADX - CC_ROADW - 20) : 4 + Math.random() * (CC_ROADX - 13),
      y: -23,
      k: kinds[Math.floor(Math.random() * kinds.length)],
      s: 0.8 + Math.random() * 0.5,
    });
  };

  useEffect(() => {
    if (!playing) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const W = cv.width, H = cv.height;
    const loop = () => {
      const st = stateRef.current;
      if (!st) return;
      // Crash sequence: keep drawing the explosion, then settle.
      if (st.crashed) {
        st.cparts.forEach((p) => { p.x += p.vx; p.y += p.vy; p.vy += 0.35; p.life -= 0.03; });
        st.cparts = st.cparts.filter((p) => p.life > 0);
        st.ftexts.forEach((t) => { t.y -= 0.6; t.life -= 0.03; });
        st.ftexts = st.ftexts.filter((t) => t.life > 0);
        st.shake = Math.max(0, st.shake - 0.5);
        drawCcScene(ctx, st);
        if (Date.now() - st.crashT > 900) { const rv = st.pendingReveal; void crash(rv ?? undefined); return; }
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      const dt = 16;
      st.tSurv += dt / 1000;
      st.dist += st.speed * dt / 16;
      // Visual speed factor (v48 speedF) drives scroll + streaks only;
      // obstacle fall speed stays the port's st.speed + 1.5.
      const sf = 1 + Math.min(0.95, (st.tSurv / 55) * 0.95);
      const scrollDelta = (st.speed + 1.5) * sf;
      st.scroll += scrollDelta;
      // Steering: keys/buttons/drag move a TARGET; the car eases toward
      // it and tilts with its lateral velocity (v48 car.tx + car.tilt).
      if (keysRef.current.l) st.tx = Math.max(30, st.tx - 5);
      if (keysRef.current.r) st.tx = Math.min(W - 30, st.tx + 5);
      const prevX = st.x;
      st.x += (st.tx - st.x) * 0.35;
      const steerV = (st.x - prevX) / (dt / 1000);
      st.tilt += (Math.max(-1, Math.min(1, steerV / 300)) * 0.13 - st.tilt) * 0.35;
      // spawn (port pacing: obstacle 0.03/frame, coin 0.02/frame)
      if (Math.random() < 0.03) spawnObstacle(st);
      if (Math.random() < 0.02) spawnCoinAt(st, false);
      st.scenT -= dt / 1000;
      if (st.scenT <= 0) { spawnScenery(st); st.scenT = 0.5 + Math.random() * 0.7; }
      if (sf > 1.12 && Math.random() < 0.15) st.streaks.push({ x: CC_ROADX + 14 + Math.random() * (CC_ROADW - 28), y: -30, len: 17 + 22 * (sf - 1), spd: 310 * sf });
      // move
      st.obstacles.forEach((o) => { o.y += st.speed + 1.5; });
      st.coins.forEach((c) => { c.y += scrollDelta; c.spin += 0.07; });
      st.scenery.forEach((s) => { s.y += scrollDelta; });
      st.streaks.forEach((s) => { s.y += s.spd * 0.016; });
      st.cparts.forEach((p) => { p.x += p.vx; p.y += p.vy; p.vy += 0.35; p.life -= 0.03; });
      st.ftexts.forEach((t) => { t.y -= 0.6; t.life -= 0.03; });
      st.obstacles = st.obstacles.filter((o) => o.y < H + 80);
      st.coins = st.coins.filter((c) => c.y < H + 20);
      st.scenery = st.scenery.filter((s) => s.y < H + 60);
      st.streaks = st.streaks.filter((s) => s.y < H + 30);
      st.cparts = st.cparts.filter((p) => p.life > 0);
      st.ftexts = st.ftexts.filter((t) => t.life > 0);
      // live odds: shared crash curve since the server's startsAt,
      // plus coin / near-miss bonuses, cap ×50.
      const elapsedMs = Date.now() - st.t0;
      const o = Math.min(50, Math.exp(0.00006 * elapsedMs) + st.bonus);
      setOdds(Math.round(o * 100) / 100);
      // collisions (port thresholds, unchanged)
      const carY = H - 90;
      for (const ob of st.obstacles) {
        if (Math.abs(ob.y - carY) < 55 && Math.abs(ob.x - st.x) < 42) { beginCrashFx(); return; }
        if (Math.abs(ob.y - carY) < 90 && Math.abs(ob.x - st.x) < 70 && Math.abs(ob.x - st.x) >= 42) {
          // near miss — once per obstacle
          if (!ob.nm) {
            ob.nm = true;
            st.bonus += 0.05;
            showFlash("NEAR MISS +0.05×");
            st.ftexts.push({ x: st.x, y: carY - 34 - 16, txt: "+0.05×", col: "#8FC3FF", life: 0.9 });
          }
        }
      }
      for (const c of [...st.coins]) {
        if (Math.abs(c.y - carY) < 40 && Math.abs(c.x - st.x) < 40) {
          st.bonus += 0.1;
          setCoins((n) => n + 1);
          st.coins = st.coins.filter((x) => x !== c);
          for (let i = 0; i < 9; i++) {
            const a = Math.random() * 6.28, sp = 1 + Math.random() * 3;
            st.cparts.push({ x: c.x, y: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 0.45 + Math.random() * 0.25, r: 1.5 + Math.random() * 1.8 });
          }
          st.ftexts.push({ x: c.x, y: c.y - 13, txt: "+0.10×", col: "#FFD964", life: 0.9 });
          showFlash("COIN +0.10×");
        }
      }
      if (o >= 50) { beginCrashFx(); return; }
      // Drive HUD, once a second. (A plain frame counter cannot live
      // here: this effect re-runs on every render because `crash` changes
      // identity each render, which would reset any closure counter.)
      const wholeSec = Math.floor(st.tSurv);
      if (wholeSec !== lastDriveRef.current) {
        lastDriveRef.current = wholeSec;
        setDrive({ t: st.tSurv, d: Math.floor(st.dist), v: Math.round(58 * sf) });
      }
      drawCcScene(ctx, st);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, crash]);

  // Pre-start: draw the road + parked car so the stage is not a blank
  // box before the first Start — the artifact shows the scene on load.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const idle: CcState = {
      x: 150, tx: 150, tilt: 0, speed: 3,
      obstacles: [
        { x: CC_LANES[0], y: 110, w: 44, h: 70, kind: "car", col: "#3E7CB1" },
        { x: CC_LANES[2], y: 230, w: 44, h: 70, kind: "truck", col: "#C2504A" },
      ],
      coins: [{ x: CC_LANES[1], y: 170, spin: 0.6 }, { x: CC_LANES[2], y: 60, spin: 1.9 }],
      dist: 0, bonus: 0, crashed: false, crashT: 0, pendingReveal: null, settled: false,
      t0: Date.now(), tSurv: 0, scroll: 0,
      scenery: [
        { side: 0, x: 12, y: 60, k: "tree", s: 1 },
        { side: 1, x: 284, y: 200, k: "tree", s: 0.9 },
        { side: 1, x: 282, y: 330, k: "sign", s: 1 },
        { side: 0, x: 10, y: 300, k: "bush", s: 1 },
      ],
      streaks: [], cparts: [], ftexts: [], shake: 0, spawnT: 0, coinT: 0, scenT: 0,
    };
    drawCcScene(ctx, idle);
  }, []);

  // Server crash: long-poll the reveal while driving — when it answers,
  // the server's round has crashed at its point and so does this run.
  // One request at a time, all 200s (no 403 console noise).
  useEffect(() => {
    if (!playing) return;
    let stopped = false;
    (async () => {
      while (!stopped) {
        const rv = await fetchReveal(20000);
        if (stopped) return;
        // Server round crashed: play the explosion first, settle after.
        if (rv) { beginCrashFx(rv); return; }
      }
    })();
    return () => { stopped = true; };
  }, [playing, fetchReveal, crash, beginCrashFx]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") keysRef.current.l = true;
      if (e.key === "ArrowRight") keysRef.current.r = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") keysRef.current.l = false;
      if (e.key === "ArrowRight") keysRef.current.r = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  const steer = (dir: -1 | 1) => {
    const st = stateRef.current;
    if (st) st.tx = Math.max(30, Math.min(300 - 30, st.tx + dir * 34));
  };

  // Drag steering on the canvas (v48): pointer down captures, drag
  // moves the car's target — the subtitle promises drag, the port
  // never wired it. Buttons/keys still work via the same target.
  const moveCarTo = (e: React.PointerEvent) => {
    const st = stateRef.current;
    const cv = canvasRef.current;
    if (!st || !cv) return;
    const r = cv.getBoundingClientRect();
    st.tx = Math.max(30, Math.min(300 - 30, ((e.clientX - r.left) / r.width) * CC_W));
  };
  const onCarDown = (e: React.PointerEvent) => {
    if (!playing) return;
    dragRef.current = true;
    try { canvasRef.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    moveCarTo(e);
  };
  const onCarMove = (e: React.PointerEvent) => { if (dragRef.current) moveCarTo(e); };
  const onCarUp = () => { dragRef.current = false; };

  return (
    <RoomShell game={game} subtitle="Top-down driving — dodge traffic, grab coins (+0.10x), near-miss (+0.05x), cash out before you crash." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency="cash" disabled={playing} />
        <div className="cc-stage">
          <div className="cc-hud"><span>ODDS <b>×{odds.toFixed(2)}</b></span><span>COINS <b>{coins}</b></span><span>CASH OUT <b>{fmtCash(Math.round(stake * odds * 100) / 100)}</b></span><span>TIME <b>{drive.t.toFixed(1)}s</b></span><span>DIST <b>{drive.d}m</b></span><span>SPEED <b>{drive.v} km/h</b></span></div>
          <div style={{ position: "relative" }}>
            <canvas ref={canvasRef} width={300} height={420} className={playing ? "cc-canvas live" : "cc-canvas"} onPointerDown={onCarDown} onPointerMove={onCarMove} onPointerUp={onCarUp} onPointerCancel={onCarUp} aria-label="Car Crash road — drag to steer" />
            {flash && <div className="cc-flash pop" key={flash.n}>{flash.txt}</div>}
            {crashInfo && !playing && (
              <div className="cc-crash">CRASHED<b>×{crashInfo.point.toFixed(2)} · {crashInfo.coins} {crashInfo.coins === 1 ? "COIN" : "COINS"}</b>The stake is gone — cash out earlier next run.</div>
            )}
          </div>
          <div className="cc-steer">
            <button type="button" aria-label="Steer left" onClick={() => steer(-1)} disabled={!playing}>←</button>
            <button type="button" aria-label="Steer right" onClick={() => steer(1)} disabled={!playing}>→</button>
          </div>
        </div>
        {!playing && <button className="btn btn-gold xg-action" type="button" onClick={() => void start()}>Start driving · {fmtCash(stake)}</button>}
        {playing && <button className="btn btn-gold xg-action cr-cash" type="button" onClick={() => void cashOut()}>CASH OUT · {fmtCash(Math.round(stake * odds * 100) / 100)}</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
        {reveal && (
          <div className="cr-reveal" aria-label="Provably fair reveal">
            <h4>Provably fair — round revealed</h4>
            <p>Server round crashed at <b>×{reveal.crashPoint.toFixed(2)}</b>. SHA-256 of the server seed must equal the hash issued at round start.</p>
            <dl>
              <div><dt>Server seed</dt><dd><code>{reveal.serverSeed}</code></dd></div>
              <div><dt>Client seed</dt><dd><code>{reveal.clientSeed}</code></dd></div>
              <div><dt>Nonce</dt><dd><code>{reveal.nonce}</code></dd></div>
              <div><dt>Crash point</dt><dd><code>×{reveal.crashPoint.toFixed(2)}</code></dd></div>
            </dl>
          </div>
        )}
      </div>
    </RoomShell>
  );
}

// ---------------- Rocket Shooter ----------------
type RsDiff = "easy" | "medium" | "hard";
const RS_GOALS: Record<RsDiff, { kills: number; mult: number }> = { easy: { kills: 20, mult: 2 }, medium: { kills: 35, mult: 3 }, hard: { kills: 50, mult: 4 } };

// ---- Rocket Shooter visuals (v48 artifact, ported to 400×420) ----
// Rules are the port's own (goals, auto speed ramp +2%/destroy, 3 lives,
// powerup durations) — only the LOOK + input are restored: starfield,
// detailed rocket with flame, jagged spinning rocks (2 HP when big),
// spinning coins, icon powerups, explosion bursts, shake, goal bar.
interface RsRock { x: number; y: number; r: number; v: number; vx: number; rot: number; vr: number; pts: number[]; hp: number }
interface RsStar { x: number; y: number; s: number; v: number }
interface RsPart { x: number; y: number; vx: number; vy: number; life: number; r: number; col: string }
interface RsFtext { x: number; y: number; txt: string; col: string; life: number }
interface RsState {
  rx: number; ry: number; tx: number; ty: number;
  rocks: RsRock[]; shots: { x: number; y: number }[];
  items: { x: number; y: number; kind: string; rot: number }[];
  coins: { x: number; y: number; spin: number }[];
  stars: RsStar[]; parts: RsPart[]; ftexts: RsFtext[];
  speed: number; shield: number; rapid: number; slow: number; double: number; t: number;
  dying: boolean; dieT: number; ended: boolean; shake: number; flash: number;
  waveT: number; itemT: number; coinT: number; fireT: number;
}
const RS_PU_COLS: Record<string, string> = { "Double Shot": "#8FC3FF", Shield: "#3ED97E", "Slow-Mo": "#45D0C4", "Rapid Fire": "#F08A1D" };

function rsBurst(st: RsState, x: number, y: number, col?: string) {
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * 6.28, sp = 1 + Math.random() * 3.2;
    st.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.4 + Math.random() * 0.3, r: 1.5 + Math.random() * 2, col: col || "#F2C230" });
  }
}
function drawRsRocket(g: CanvasRenderingContext2D, st: RsState) {
  g.save(); g.translate(st.rx, st.ry);
  if (st.shield > 0) {
    g.strokeStyle = "rgba(62,217,126,.75)"; g.lineWidth = 2.4;
    g.beginPath(); g.arc(0, 0, 33, 0, 7); g.stroke();
    g.fillStyle = "rgba(62,217,126,.10)"; g.beginPath(); g.arc(0, 0, 33, 0, 7); g.fill();
  }
  const fl = 13 + Math.random() * 9;
  g.fillStyle = "#F08A1D"; g.beginPath(); g.moveTo(-6, 24); g.lineTo(0, 24 + fl); g.lineTo(6, 24); g.closePath(); g.fill();
  g.fillStyle = "#FFD964"; g.beginPath(); g.moveTo(-3.4, 24); g.lineTo(0, 24 + fl * 0.62); g.lineTo(3.4, 24); g.closePath(); g.fill();
  g.fillStyle = "#C22828";
  g.beginPath(); g.moveTo(-9, 8); g.lineTo(-21, 26); g.lineTo(-9, 26); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(9, 8); g.lineTo(21, 26); g.lineTo(9, 26); g.closePath(); g.fill();
  const bg = g.createLinearGradient(-11, 0, 11, 0);
  bg.addColorStop(0, "#D8DCE6"); bg.addColorStop(0.5, "#FFFFFF"); bg.addColorStop(1, "#B9BECB");
  g.fillStyle = bg;
  g.beginPath(); g.moveTo(0, -30); g.quadraticCurveTo(11, -14, 11, 4); g.lineTo(11, 24); g.lineTo(-11, 24); g.lineTo(-11, 4); g.quadraticCurveTo(-11, -14, 0, -30); g.closePath(); g.fill();
  g.fillStyle = "#E5322D"; g.beginPath(); g.moveTo(0, -30); g.quadraticCurveTo(6, -21, 8.6, -13); g.lineTo(-8.6, -13); g.quadraticCurveTo(-6, -21, 0, -30); g.closePath(); g.fill();
  g.fillStyle = "#F2C230"; g.fillRect(-11, 12, 22, 4.6);
  g.fillStyle = "#8FD0FF"; g.beginPath(); g.arc(0, -2, 5.6, 0, 7); g.fill();
  g.strokeStyle = "#2B5EA7"; g.lineWidth = 1.8; g.stroke();
  g.restore();
}
function drawRsRock(g: CanvasRenderingContext2D, r: RsRock) {
  g.save(); g.translate(r.x, r.y); g.rotate(r.rot);
  g.beginPath();
  for (let i = 0; i < r.pts.length; i++) {
    const a = i / r.pts.length * Math.PI * 2, rad = r.r * r.pts[i];
    if (i === 0) g.moveTo(Math.cos(a) * rad, Math.sin(a) * rad); else g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  g.closePath();
  const rg = g.createRadialGradient(-r.r * 0.3, -r.r * 0.3, r.r * 0.2, 0, 0, r.r * 1.15);
  rg.addColorStop(0, "#A89C8C"); rg.addColorStop(0.6, "#7C7264"); rg.addColorStop(1, "#55483C");
  g.fillStyle = rg; g.fill();
  g.strokeStyle = "rgba(20,16,10,.5)"; g.lineWidth = 1.6; g.stroke();
  g.fillStyle = "rgba(30,24,18,.4)";
  g.beginPath(); g.arc(-r.r * 0.25, -r.r * 0.1, r.r * 0.2, 0, 7); g.fill();
  g.beginPath(); g.arc(r.r * 0.3, r.r * 0.28, r.r * 0.15, 0, 7); g.fill();
  g.beginPath(); g.arc(r.r * 0.12, -r.r * 0.42, r.r * 0.11, 0, 7); g.fill();
  if (r.hp === 1 && r.r >= 28) {
    g.strokeStyle = "rgba(15,12,8,.75)"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-r.r * 0.5, -r.r * 0.3); g.lineTo(-r.r * 0.1, 0); g.lineTo(-r.r * 0.3, r.r * 0.4); g.lineTo(r.r * 0.2, r.r * 0.55); g.stroke();
  }
  g.restore();
}
function drawRsCoin(g: CanvasRenderingContext2D, c: { x: number; y: number; spin: number }) {
  const sq = 0.3 + 0.7 * Math.abs(Math.cos(c.spin));
  g.save(); g.translate(c.x, c.y);
  g.shadowColor = "rgba(242,194,48,.85)"; g.shadowBlur = 5;
  g.scale(sq, 1);
  const cg = g.createRadialGradient(-2, -2.5, 1, 0, 0, 7);
  cg.addColorStop(0, "#FFEFA8"); cg.addColorStop(0.6, "#F2C230"); cg.addColorStop(1, "#C99612");
  g.fillStyle = cg; g.beginPath(); g.arc(0, 0, 6.5, 0, 7); g.fill();
  g.shadowBlur = 0;
  g.strokeStyle = "#9A7410"; g.lineWidth = 0.9; g.beginPath(); g.arc(0, 0, 6.5, 0, 7); g.stroke();
  if (sq > 0.55) { g.fillStyle = "#8A5E06"; g.font = "900 7px Outfit, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("₵", 0, 0.5); }
  g.restore();
}
function drawRsItem(g: CanvasRenderingContext2D, it: { x: number; y: number; kind: string; rot: number }, tSurv: number) {
  const col = RS_PU_COLS[it.kind] || "#8FC3FF";
  g.save(); g.translate(it.x, it.y);
  const pulse = 1 + Math.sin(tSurv * 5 + it.rot) * 0.07;
  g.scale(pulse, pulse);
  g.shadowColor = col; g.shadowBlur = 7;
  g.fillStyle = "rgba(4,6,13,.9)"; g.beginPath(); g.arc(0, 0, 17, 0, 7); g.fill();
  g.shadowBlur = 0;
  g.strokeStyle = col; g.lineWidth = 2.4; g.beginPath(); g.arc(0, 0, 17, 0, 7); g.stroke();
  g.fillStyle = col; g.strokeStyle = col;
  if (it.kind === "Double Shot") {
    g.beginPath(); g.ellipse(-5.5, 0, 3.4, 8.5, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(5.5, 0, 3.4, 8.5, 0, 0, 7); g.fill();
  } else if (it.kind === "Shield") {
    g.beginPath(); g.moveTo(0, -10); g.lineTo(8, -6.5); g.lineTo(8, 1.5); g.quadraticCurveTo(8, 8.5, 0, 11); g.quadraticCurveTo(-8, 8.5, -8, 1.5); g.lineTo(-8, -6.5); g.closePath(); g.fill();
    g.fillStyle = "rgba(4,6,13,.9)"; g.beginPath(); g.moveTo(0, -6); g.lineTo(4.8, -3.8); g.lineTo(4.8, 1.2); g.quadraticCurveTo(4.8, 5.6, 0, 7.4); g.quadraticCurveTo(-4.8, 5.6, -4.8, 1.2); g.lineTo(-4.8, -3.8); g.closePath(); g.fill();
  } else if (it.kind === "Slow-Mo") {
    g.lineWidth = 2.6; g.beginPath(); g.arc(0, 0, 9.5, 0, 7); g.stroke();
    g.lineWidth = 2.4; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -6.4); g.moveTo(0, 0); g.lineTo(4.6, 2.4); g.stroke();
  } else {
    g.beginPath(); g.moveTo(2.5, -11); g.lineTo(-6, 1.5); g.lineTo(-0.8, 1.5); g.lineTo(-2.5, 11); g.lineTo(6.5, -2.2); g.lineTo(1.2, -2.2); g.closePath(); g.fill();
  }
  g.restore();
}
function drawRsScene(g: CanvasRenderingContext2D, st: RsState) {
  const W = 400, H = 420;
  g.save();
  if (st.shake > 0) g.translate((Math.random() - 0.5) * st.shake, (Math.random() - 0.5) * st.shake);
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#101D42"); bg.addColorStop(0.6, "#0A1130"); bg.addColorStop(1, "#05070F");
  g.fillStyle = bg; g.fillRect(-20, -20, W + 40, H + 40);
  g.fillStyle = "rgba(255,246,216,.9)";
  st.stars.forEach((s) => { g.globalAlpha = 0.35 + s.s * 0.3; g.fillRect(s.x, s.y, s.s, s.s); });
  g.globalAlpha = 1;
  st.coins.forEach((c) => drawRsCoin(g, c));
  st.rocks.forEach((r) => drawRsRock(g, r));
  st.items.forEach((it) => drawRsItem(g, it, st.t));
  g.fillStyle = "#FFD964";
  st.shots.forEach((s) => {
    g.save(); g.shadowColor = "rgba(255,217,100,.9)"; g.shadowBlur = 8;
    g.beginPath(); g.ellipse(s.x, s.y, 3, 8, 0, 0, 7); g.fill(); g.restore();
  });
  st.parts.forEach((p) => { g.globalAlpha = Math.max(0, p.life * 2); g.fillStyle = p.col || "#F2C230"; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); });
  g.globalAlpha = 1;
  st.ftexts.forEach((t) => { g.globalAlpha = Math.max(0, t.life * 1.6); g.fillStyle = t.col; g.font = "900 12px ui-monospace, Menlo, monospace"; g.textAlign = "center"; g.fillText(t.txt, t.x, t.y); });
  g.globalAlpha = 1;
  if (!st.dying) drawRsRocket(g, st);
  else {
    g.save(); g.translate(st.rx, st.ry);
    g.strokeStyle = "#FFD964"; g.lineWidth = 4; g.lineCap = "round";
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * 18, Math.sin(a) * 18); g.lineTo(Math.cos(a) * 48, Math.sin(a) * 48); g.stroke(); }
    g.fillStyle = "rgba(240,138,29,.85)"; g.beginPath(); g.arc(0, 0, 23, 0, 7); g.fill();
    g.fillStyle = "rgba(229,50,45,.9)"; g.beginPath(); g.arc(0, 0, 14, 0, 7); g.fill();
    g.restore();
  }
  if (st.flash > 0) {
    g.fillStyle = `rgba(229,50,45,${Math.min(0.4, st.flash)})`;
    g.fillRect(-20, -20, W + 40, H + 40);
  }
  g.restore();
}
export function RocketShooterRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(10);
  const [diff, setDiff] = useState<RsDiff>("easy");
  const [playing, setPlaying] = useState(false);
  const [kills, setKills] = useState(0);
  const [lives, setLives] = useState(3);
  const [coins, setCoins] = useState(0);
  const [power, setPower] = useState("");
  const [msg, setMsg] = useState("Pick a difficulty, set your stake and start. Reach the kill goal to win — EASY 20 pays ×2, MEDIUM 35 pays ×3, HARD 50 pays ×4.");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // All-games sound pass: shots spawn inside the rAF loop, so the mute
  // flag is read through a ref (mirror the Car Crash mutedRef pattern).
  const mutedRef = useRef(room.muted);
  mutedRef.current = room.muted;
  const stRef = useRef<RsState | null>(null);
  const rafRef = useRef(0);
  const killsRef = useRef(0);
  const livesRef = useRef(3);
  // v48 input: drag steers + fires, FIRE button / Space fire, arrows/WASD.
  const firingRef = useRef(false);
  const dragRef = useRef(false);
  const keysRef = useRef<{ l: boolean; r: boolean; u: boolean; d: boolean }>({ l: false, r: false, u: false, d: false });
  const lastPowRef = useRef("");
  const lastPowTRef = useRef(0);

  const goal = RS_GOALS[diff];

  const end = useCallback(async (won: boolean, k: number) => {
    const st = stRef.current;
    if (st?.ended) return;
    if (st) st.ended = true;
    firingRef.current = false;
    dragRef.current = false;
    cancelAnimationFrame(rafRef.current);
    setPlaying(false);
    const payout = won ? Math.round(stake * goal.mult * 100) / 100 : 0;
    setMsg(won ? `Goal reached — ${k} kills! ×${goal.mult} = ${fmtCash(payout)}` : `Ship down — ${k}/${goal.kills} kills. Goal not reached.`);
    await room.settle(stake, payout, { kills: k, diff, goal: goal.kills });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stake, goal, diff, room]);

  const spawnRock = (st: RsState, atX?: number, atY?: number) => {
    const r = 12 + Math.random() * 20;
    const pts: number[] = [];
    for (let i = 0; i < 9; i++) pts.push(0.78 + Math.random() * 0.34);
    st.rocks.push({
      x: atX !== undefined ? atX : 34 + Math.random() * (400 - 68),
      y: atY !== undefined ? atY : -r - 8,
      r, v: (1 + Math.random()) * st.speed, vx: (Math.random() - 0.5) * 0.9,
      rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.03,
      pts, hp: r >= 28 ? 2 : 1,
    });
  };

  const start = () => {
    if (room.balance < stake) { setMsg("Balance too low for that stake."); return; }
    const stars: RsStar[] = [];
    for (let i = 0; i < 90; i++) stars.push({ x: Math.random() * 400, y: Math.random() * 420, s: Math.random() * 1.8 + 0.4, v: 20 + Math.random() * 50 });
    const st: RsState = {
      rx: 200, ry: 370, tx: 200, ty: 370, rocks: [], shots: [], items: [], coins: [],
      stars, parts: [], ftexts: [], speed: 1, shield: 0, rapid: 0, slow: 0, double: 0, t: 0,
      dying: false, dieT: 0, ended: false, shake: 0, flash: 0,
      waveT: 0.8, itemT: 1.3, coinT: 1.6, fireT: 0,
    };
    stRef.current = st;
    spawnRock(st, 150, -60);
    spawnRock(st, 290, -190);
    killsRef.current = 0; livesRef.current = 3;
    lastPowRef.current = "";
    setKills(0); setLives(3); setCoins(0); setPower(""); setPlaying(true);
    setMsg(`Goal: ${goal.kills} kills for ×${goal.mult}.`);
  };

  useEffect(() => {
    if (!playing) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const W = cv.width, H = cv.height;
    let lastT = 0;
    const loop = (t: number) => {
      const st = stRef.current;
      if (!st) return;
      const dt = Math.min(0.05, lastT ? (t - lastT) / 1000 : 0.016);
      lastT = t;
      st.t += dt;
      // Ship destroyed: play the explosion, then settle.
      if (st.dying) {
        st.parts.forEach((p) => { p.x += p.vx * dt * 60; p.y += p.vy * dt * 60; p.life -= dt; });
        st.parts = st.parts.filter((p) => p.life > 0);
        st.shake = Math.max(0, st.shake - 0.5);
        drawRsScene(ctx, st);
        if (Date.now() - st.dieT > 700) { void end(false, killsRef.current); return; }
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      // Steering: keys + drag move a TARGET; the ship eases toward it.
      const kv = 335;
      if (keysRef.current.l) st.tx -= kv * dt;
      if (keysRef.current.r) st.tx += kv * dt;
      if (keysRef.current.u) st.ty -= kv * dt;
      if (keysRef.current.d) st.ty += kv * dt;
      st.tx = Math.max(24, Math.min(W - 24, st.tx));
      st.ty = Math.max(H * 0.36, Math.min(H - 42, st.ty));
      st.rx += (st.tx - st.rx) * Math.min(1, dt * 12);
      st.ry += (st.ty - st.ry) * Math.min(1, dt * 12);
      st.stars.forEach((s) => { s.y += s.v * dt * 2.2; if (s.y > H) { s.y = -2; s.x = Math.random() * W; } });
      // Fire only while firing (drag / FIRE button / Space — v48).
      // The port auto-fired always; the artifact fires on hold.
      st.fireT -= dt * 1000;
      if (firingRef.current && st.fireT <= 0) {
        if (st.double > 0) { st.shots.push({ x: st.rx - 10, y: st.ry - 26 }); st.shots.push({ x: st.rx + 10, y: st.ry - 26 }); }
        else st.shots.push({ x: st.rx, y: st.ry - 30 });
        playSfx("shoot", mutedRef.current);
        st.fireT = st.rapid > 0 ? 70 : 140;
      }
      // Wave spawner (v48): waves of 2–4, growing with kills.
      st.waveT -= dt;
      if (st.waveT <= 0) {
        const n = 2 + Math.floor(Math.random() * 3) + (killsRef.current >= 15 ? 1 : 0) + (killsRef.current >= 30 ? 1 : 0);
        for (let i = 0; i < n; i++) spawnRock(st);
        st.waveT = Math.max(0.85, 2.1 - st.t * 0.012 - killsRef.current * 0.008) * (0.8 + Math.random() * 0.45);
      }
      st.itemT -= dt;
      if (st.itemT <= 0) {
        st.items.push({ x: 44 + Math.random() * (W - 88), y: -20, kind: ["Double Shot", "Shield", "Slow-Mo", "Rapid Fire"][Math.floor(Math.random() * 4)], rot: Math.random() * 6.28 });
        st.itemT = 5 + Math.random() * 2.5;
      }
      st.coinT -= dt;
      if (st.coinT <= 0) {
        let x: number;
        if (st.rocks.length && Math.random() < 0.4) {
          const r = st.rocks[Math.floor(Math.random() * st.rocks.length)];
          x = Math.max(26, Math.min(W - 26, r.x + (Math.random() * 90 - 45)));
        } else x = 30 + Math.random() * (W - 60);
        st.coins.push({ x, y: -22, spin: Math.random() * 3 });
        st.coinT = 2.6 + Math.random() * 1.8;
      }
      const slowF = st.slow > 0 ? 0.45 : 1;
      const sm = Math.min(3, Math.pow(1.02, killsRef.current)) * slowF;
      st.shots.forEach((s) => { s.y -= 640 * dt; });
      st.rocks.forEach((r) => {
        // r.v is px/frame at 60fps; dt*60 normalises it per frame.
        r.y += r.v * sm * dt * 60;
        r.x += r.vx * dt * 60;
        r.rot += r.vr * dt * 60;
        if (r.x < r.r) { r.x = r.r; r.vx *= -1; }
        if (r.x > W - r.r) { r.x = W - r.r; r.vx *= -1; }
      });
      st.items.forEach((it) => { it.y += 106 * slowF * dt; it.rot += dt; });
      st.coins.forEach((c) => { c.y += 88 * slowF * dt; c.spin += dt * 4; });
      st.shots = st.shots.filter((s) => s.y > -14);
      st.rocks = st.rocks.filter((r) => r.y - r.r < H + 30);
      // collisions: shots vs rocks (big rocks take 2 hits — v48)
      for (let bi = st.shots.length - 1; bi >= 0; bi--) {
        const b = st.shots[bi];
        let used = false;
        for (let ri = st.rocks.length - 1; ri >= 0; ri--) {
          const r = st.rocks[ri];
          const dx = b.x - r.x, dy = b.y - r.y;
          if (dx * dx + dy * dy < r.r * r.r) {
            used = true;
            r.hp--;
            if (r.hp <= 0) {
              rsBurst(st, r.x, r.y);
              st.rocks.splice(ri, 1);
              killsRef.current++;
              setKills(killsRef.current);
              st.speed *= 1.02; // ~+2% per destroy
              if (killsRef.current >= goal.kills) { void end(true, killsRef.current); return; }
            }
            break;
          }
        }
        if (used) st.shots.splice(bi, 1);
      }
      // rocks vs ship
      for (const r of [...st.rocks]) {
        const hx = r.x - st.rx, hy = r.y - st.ry;
        if (hx * hx + hy * hy < Math.pow(r.r * 0.8 + 19 * 0.8, 2)) {
          st.rocks = st.rocks.filter((x) => x !== r);
          if (st.shield > 0) {
            st.shield = 0;
            rsBurst(st, r.x, r.y, "#3ED97E");
            st.ftexts.push({ x: st.rx, y: st.ry - 40, txt: "SHIELD SAVED YOU!", col: "#3ED97E", life: 1.1 });
            setPower("Shield absorbed a hit!");
            continue;
          }
          rsBurst(st, st.rx, st.ry, "#F08A1D");
          st.shake = 8;
          st.flash = 0.3;
          livesRef.current--;
          setLives(livesRef.current);
          if (livesRef.current <= 0) {
            st.dying = true;
            st.dieT = Date.now();
            st.shake = 14;
            rsBurst(st, st.rx, st.ry, "#E5322D");
          }
        }
      }
      // items + coins
      for (const it of [...st.items]) {
        const ddx = it.x - st.rx, ddy = it.y - st.ry;
        if (ddx * ddx + ddy * ddy < 34 * 34) {
          st.items = st.items.filter((x) => x !== it);
          st.ftexts.push({ x: it.x, y: it.y - 20, txt: it.kind.toUpperCase() + "!", col: "#3ED97E", life: 0.95 });
          rsBurst(st, it.x, it.y, "#3ED97E");
          if (it.kind === "Double Shot") st.double = 600;
          if (it.kind === "Shield") st.shield = 1;
          if (it.kind === "Slow-Mo") st.slow = 400;
          if (it.kind === "Rapid Fire") st.rapid = 500;
        }
      }
      st.items = st.items.filter((it) => it.y < H + 30);
      for (const c of [...st.coins]) {
        const ddx = c.x - st.rx, ddy = c.y - st.ry;
        if (ddx * ddx + ddy * ddy < 32 * 32) {
          st.coins = st.coins.filter((x) => x !== c);
          setCoins((n) => n + 1);
          st.ftexts.push({ x: c.x, y: c.y - 18, txt: "+1 COIN", col: "#FFD964", life: 0.9 });
        }
      }
      st.coins = st.coins.filter((c) => c.y < H + 26);
      st.parts.forEach((p) => { p.x += p.vx * dt * 60; p.y += p.vy * dt * 60; p.life -= dt; });
      st.parts = st.parts.filter((p) => p.life > 0);
      st.ftexts.forEach((t) => { t.y -= 32 * dt; t.life -= dt; });
      st.ftexts = st.ftexts.filter((t) => t.life > 0);
      st.double = Math.max(0, st.double - 1); st.slow = Math.max(0, st.slow - 1); st.rapid = Math.max(0, st.rapid - 1);
      if (st.shake > 0) st.shake = Math.max(0, st.shake - 0.5);
      if (st.flash > 0) st.flash = Math.max(0, st.flash - dt * 0.9);
      // Power chip, ~4Hz. (Same closure-counter trap as Car Crash: this
      // effect re-runs on every render, so the throttle lives in a ref.)
      if (st.t - lastPowTRef.current >= 0.25) {
        lastPowTRef.current = st.t;
        const parts2: string[] = [];
        if (st.double > 0) parts2.push("DOUBLE SHOT " + Math.ceil(st.double / 60) + "s");
        if (st.rapid > 0) parts2.push("RAPID FIRE " + Math.ceil(st.rapid / 60) + "s");
        if (st.slow > 0) parts2.push("SLOW-MO " + Math.ceil(st.slow / 60) + "s");
        if (st.shield > 0) parts2.push("SHIELD READY");
        const txt = parts2.join(" · ") || (playing ? "—" : "");
        if (txt !== lastPowRef.current) { lastPowRef.current = txt; setPower(txt); }
      }
      drawRsScene(ctx, st);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, goal, end]);

  // Pre-start: draw the ship + a few asteroids over the starfield so
  // the stage is not a blank box before the first Launch.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const stars: RsStar[] = [];
    for (let i = 0; i < 90; i++) stars.push({ x: Math.random() * 400, y: Math.random() * 420, s: Math.random() * 1.8 + 0.4, v: 20 + Math.random() * 50 });
    const idle: RsState = {
      rx: 200, ry: 370, tx: 200, ty: 370, rocks: [], shots: [], items: [],
      coins: [{ x: 320, y: 120, spin: 0.6 }],
      stars, parts: [], ftexts: [], speed: 1, shield: 0, rapid: 0, slow: 0, double: 0, t: 0,
      dying: false, dieT: 0, ended: false, shake: 0, flash: 0,
      waveT: 0, itemT: 0, coinT: 0, fireT: 0,
    };
    [[70, 90, 18], [200, 160, 24], [330, 240, 15]].forEach(([x, y, r]) => {
      const pts: number[] = [];
      for (let i = 0; i < 9; i++) pts.push(0.78 + Math.random() * 0.34);
      idle.rocks.push({ x, y, r, v: 0, vx: 0, rot: Math.random() * 6.28, vr: 0, pts, hp: 1 });
    });
    drawRsScene(ctx, idle);
  }, []);

  // v48 input: drag steers (x AND y) + fires; FIRE button / Space fire;
  // arrows/WASD steer. The port only steered x on hover-move and
  // auto-fired always.
  const moveShipTo = (e: React.PointerEvent) => {
    const st = stRef.current;
    const cv = canvasRef.current;
    if (!st || !cv) return;
    const r = cv.getBoundingClientRect();
    st.tx = Math.max(24, Math.min(400 - 24, ((e.clientX - r.left) / r.width) * 400));
    st.ty = Math.max(420 * 0.36, Math.min(420 - 42, ((e.clientY - r.top) / r.height) * 420));
  };
  const onShipDown = (e: React.PointerEvent) => {
    if (!playing) return;
    dragRef.current = true;
    firingRef.current = true;
    try { canvasRef.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    moveShipTo(e);
  };
  const onShipMove = (e: React.PointerEvent) => { if (dragRef.current) moveShipTo(e); };
  const onShipUp = () => { dragRef.current = false; firingRef.current = false; };
  const onFireDown = (e: React.PointerEvent) => {
    if (!playing) return;
    firingRef.current = true;
    try { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
  };
  const onFireUp = () => { firingRef.current = false; };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") { keysRef.current.l = true; if (playing) e.preventDefault(); }
      else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") { keysRef.current.r = true; if (playing) e.preventDefault(); }
      else if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") { keysRef.current.u = true; if (playing) e.preventDefault(); }
      else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") { keysRef.current.d = true; if (playing) e.preventDefault(); }
      else if (e.key === " ") { firingRef.current = true; if (playing) e.preventDefault(); }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") keysRef.current.l = false;
      else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keysRef.current.r = false;
      else if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") keysRef.current.u = false;
      else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") keysRef.current.d = false;
      else if (e.key === " ") firingRef.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [playing]);

  return (
    <RoomShell game={game} subtitle="Shoot the asteroids. Reach the kill goal to win — EASY 20 → ×2, MEDIUM 35 → ×3, HARD 50 → ×4." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency="cash" disabled={playing} />
        <div className="xg-pickrow" role="group" aria-label="Difficulty">
          {(["easy", "medium", "hard"] as RsDiff[]).map((d) => (
            <button key={d} type="button" className="xg-pick" aria-pressed={diff === d} onClick={() => setDiff(d)} disabled={playing}>
              <span className="xg-pick-txt">{d.toUpperCase()}</span>
            </button>
          ))}
        </div>
        <div className="rs-goal-wrap">
          <div className="rs-goal-lab"><span>DESTROY {goal.kills} ASTEROIDS</span><b>{kills} / {goal.kills}</b></div>
          <div className="rs-goal-bar"><i style={{ width: `${Math.min(100, (kills / goal.kills) * 100)}%` }} /></div>
        </div>
        <div className="rs-hud"><span>KILLS <b>{kills}/{goal.kills}</b></span><span>SPEED <b>×{Math.min(3, Math.pow(1.02, kills)).toFixed(1)}</b></span><span>LIVES <b>{"♥".repeat(Math.max(0, lives))}</b></span><span>COINS <b>{coins}</b></span><span>PAYS <b>×{goal.mult.toFixed(2)}</b></span><span className="rs-pow">{power}</span></div>
        <canvas ref={canvasRef} width={400} height={420} className={playing ? "rs-canvas live" : "rs-canvas"} onPointerDown={onShipDown} onPointerMove={onShipMove} onPointerUp={onShipUp} onPointerCancel={onShipUp} aria-label="Rocket Shooter — drag to steer and fire" />
        <button className="rs-fire" type="button" onPointerDown={onFireDown} onPointerUp={onFireUp} onPointerLeave={onFireUp} onPointerCancel={onFireUp} disabled={!playing} aria-label="Hold to fire">HOLD TO FIRE</button>
        {!playing && <button className="btn btn-gold xg-action" type="button" onClick={start}>Launch · {fmtCash(stake)}</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}

// ---------------- Fruit Ninja ----------------
const FN_GOALS = [{ score: 150, mult: 2 }, { score: 250, mult: 3 }, { score: 400, mult: 4 }];
const FN_W = 400, FN_H = 420;

/* collide.js (v48 artifact): does segment (x1,y1)-(x2,y2) cross the
   ellipse centred (cx,cy) with radius r? A fast flick must not jump
   over a fruit between pointer samples — the old point-only test did
   exactly that, so quick swipes missed fruit they visibly crossed. */
function segHitsEllipse(x1: number, y1: number, x2: number, y2: number, cx: number, cy: number, r: number): boolean {
  const dx = x2 - x1, dy = y2 - y1;
  const a = dx * dx + dy * dy;
  if (a <= 0) return (x1 - cx) * (x1 - cx) + (y1 - cy) * (y1 - cy) <= r * r;
  const b = 2 * (dx * (x1 - cx) + dy * (y1 - cy));
  const c = (x1 - cx) * (x1 - cx) + (y1 - cy) * (y1 - cy) - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return false;
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / (2 * a), t2 = (-b + sq) / (2 * a);
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
}

const FN_JUICE: Record<string, { juice: string; flesh: string; skin: string }> = {
  "🍎": { juice: "#C8E925", flesh: "#FFF3D6", skin: "#C01F1F" },
  "🍊": { juice: "#F5D76E", flesh: "#FFE9A8", skin: "#E3AC1B" },
  "🍉": { juice: "#E5322D", flesh: "#FF8A80", skin: "#1E8C4D" },
  "🍇": { juice: "#B3001B", flesh: "#D6336C", skin: "#8E1220" },
  "💣": { juice: "#F08A1D", flesh: "#39404E", skin: "#23262E" },
};

interface FnFruit { x: number; y: number; vx: number; vy: number; kind: string; r: number; rot: number; vr: number }
interface FnHalf { r: number; x: number; y: number; vx: number; vy: number; rot: number; vr: number; life: number; flesh: string; skin: string; kind: string }
interface FnPart { x: number; y: number; vx: number; vy: number; r: number; color: string; life: number; ttl: number }
interface FnFloat { x: number; y: number; txt: string; color: string; life: number }
interface FnBlade { x1: number; y1: number; x2: number; y2: number; life: number }
interface FnState { fruits: FnFruit[]; halves: FnHalf[]; parts: FnPart[]; floats: FnFloat[]; blades: FnBlade[]; speed: number; t0: number; spawnT: number; flash: number; lastPt: { x: number; y: number } | null }
// ---- Drawn fruit (no emoji glyphs) ----
// Each fruit is canvas art inside the r:34 hit circle: a shaded sphere
// (radial gradient, light top-left, dark rim), a white gloss highlight,
// and its own details — stem + leaf on the apple/orange, rind stripes
// on the watermelon, a grape bunch, a fused iron bomb. The look never
// outgrows the hit test, and the slice halves reuse the same palette.
function drawFnFruit(g: CanvasRenderingContext2D, kind: string, r: number): void {
  const sphere = (stops: [number, string][], rad = r * 0.94) => {
    const gr = g.createRadialGradient(-r * 0.35, -r * 0.42, r * 0.08, 0, 0, rad);
    stops.forEach(([o, c]) => gr.addColorStop(o, c));
    g.fillStyle = gr;
    g.beginPath(); g.arc(0, 0, rad, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(0,0,0,.45)"; g.lineWidth = 1.5;
    g.beginPath(); g.arc(0, 0, rad, 0, Math.PI * 2); g.stroke();
  };
  const gloss = (x: number, y: number, rx: number, ry: number, a = 0.8) => {
    g.fillStyle = `rgba(255,255,255,${a})`;
    g.beginPath(); g.ellipse(x, y, rx, ry, -0.55, 0, Math.PI * 2); g.fill();
  };
  const stemLeaf = (leafCol: string) => {
    g.strokeStyle = "#5E3A16"; g.lineWidth = 3; g.lineCap = "round";
    g.beginPath(); g.moveTo(0, -r * 0.82); g.quadraticCurveTo(2, -r * 1.02, 5, -r * 1.1); g.stroke();
    const lg = g.createLinearGradient(0, -r, r * 0.5, -r * 0.7);
    lg.addColorStop(0, "#5BE584"); lg.addColorStop(1, leafCol);
    g.fillStyle = lg;
    g.beginPath(); g.ellipse(r * 0.34, -r * 0.92, r * 0.3, r * 0.14, -0.6, 0, Math.PI * 2); g.fill();
  };
  if (kind === "🍎") {
    sphere([[0, "#FF9A8A"], [0.45, "#E5322D"], [0.8, "#A31212"], [1, "#6E0B0B"]]);
    gloss(-r * 0.34, -r * 0.42, r * 0.26, r * 0.14);
    // Shoulder dimple + bottom shading so it reads round, not flat.
    g.fillStyle = "rgba(0,0,0,.22)";
    g.beginPath(); g.ellipse(0, r * 0.78, r * 0.34, r * 0.1, 0, 0, Math.PI * 2); g.fill();
    stemLeaf("#1E7A52");
  } else if (kind === "🍊") {
    sphere([[0, "#FFE9A8"], [0.45, "#F5A83D"], [0.8, "#E07B00"], [1, "#9A5200"]]);
    gloss(-r * 0.34, -r * 0.42, r * 0.26, r * 0.14);
    // Peel dimples: a fixed ring of tiny darker pores.
    g.fillStyle = "rgba(150,80,0,.35)";
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.4;
      g.beginPath(); g.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, 1.6, 0, Math.PI * 2); g.fill();
    }
    stemLeaf("#2E9E5B");
  } else if (kind === "🍉") {
    sphere([[0, "#7DDC9B"], [0.5, "#2FA866"], [0.85, "#177A44"], [1, "#0C4D28"]]);
    // Rind stripes, clipped to the sphere.
    g.save();
    g.beginPath(); g.arc(0, 0, r * 0.94, 0, Math.PI * 2); g.clip();
    g.strokeStyle = "rgba(8,60,30,.6)"; g.lineWidth = r * 0.16; g.lineCap = "round";
    [-0.55, -0.18, 0.18, 0.55].forEach((fx) => {
      g.beginPath();
      g.moveTo(fx * r, -r);
      g.quadraticCurveTo(fx * r + r * 0.12, 0, fx * r, r);
      g.stroke();
    });
    g.restore();
    gloss(-r * 0.34, -r * 0.42, r * 0.26, r * 0.14, 0.7);
    g.strokeStyle = "#5E3A16"; g.lineWidth = 3; g.lineCap = "round";
    g.beginPath(); g.moveTo(0, -r * 0.86); g.quadraticCurveTo(3, -r * 1.04, 6, -r * 1.08); g.stroke();
  } else if (kind === "🍇") {
    // A bunch of seven shaded grapes + stem and leaf.
    const grape = (gx: number, gy: number, gr: number) => {
      const gg = g.createRadialGradient(gx - gr * 0.35, gy - gr * 0.4, gr * 0.1, gx, gy, gr);
      gg.addColorStop(0, "#E87AA8"); gg.addColorStop(0.5, "#8E2A5C"); gg.addColorStop(1, "#4A0E2E");
      g.fillStyle = gg;
      g.beginPath(); g.arc(gx, gy, gr, 0, Math.PI * 2); g.fill();
      g.fillStyle = "rgba(255,255,255,.75)";
      g.beginPath(); g.ellipse(gx - gr * 0.32, gy - gr * 0.38, gr * 0.28, gr * 0.16, -0.5, 0, Math.PI * 2); g.fill();
    };
    const gr = r * 0.34;
    grape(0, -r * 0.52, gr);
    grape(-r * 0.4, -r * 0.14, gr); grape(r * 0.4, -r * 0.14, gr);
    grape(-r * 0.58, r * 0.28, gr); grape(0, r * 0.28, gr); grape(r * 0.58, r * 0.28, gr);
    grape(0, r * 0.66, gr * 0.92);
    g.strokeStyle = "#5E3A16"; g.lineWidth = 3; g.lineCap = "round";
    g.beginPath(); g.moveTo(0, -r * 0.78); g.quadraticCurveTo(2, -r * 1.0, 5, -r * 1.08); g.stroke();
    g.fillStyle = "#2E9E5B";
    g.beginPath(); g.ellipse(r * 0.36, -r * 0.86, r * 0.28, r * 0.13, -0.6, 0, Math.PI * 2); g.fill();
  } else {
    // 💣 Bomb: shaded iron sphere, fuse + spark.
    sphere([[0, "#7A8194"], [0.45, "#2E323D"], [0.8, "#171A21"], [1, "#07080D"]]);
    gloss(-r * 0.34, -r * 0.42, r * 0.24, r * 0.13, 0.7);
    g.strokeStyle = "#8A6D3B"; g.lineWidth = 2.5; g.lineCap = "round";
    g.beginPath(); g.moveTo(0, -r * 0.88); g.quadraticCurveTo(r * 0.18, -r * 1.12, r * 0.42, -r * 1.06); g.stroke();
    g.save();
    g.translate(r * 0.46, -r * 1.08);
    g.shadowColor = "rgba(255,158,44,.95)"; g.shadowBlur = 8;
    g.fillStyle = "#FFD964";
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const rr = i % 2 ? 2.2 : 5.5;
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath(); g.fill();
    g.restore();
  }
}

export function FruitNinjaRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(5);
  const [playing, setPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [coins, setCoins] = useState(0);
  const [timeLeft, setTimeLeft] = useState(45);
  const [msg, setMsg] = useState("Swipe or drag across the fruit to slice. Fruit is 10 pts, combos pay ×2/×3, coins are +25 pts — slice a bomb and the round ends on the spot.");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stRef = useRef<FnState | null>(null);
  const rafRef = useRef(0);
  const scoreRef = useRef(0);
  const livesRef = useRef(3);

  // Fruit are drawn canvas art (drawFnFruit) at r:34 with a hit test of
  // r+18 against the whole swipe segment — a thumb lands it easily on a
  // 390px phone. v48 fruit were r 44–56 on a 900-wide stage, i.e. ~40px
  // across on a phone; 34px radius on this 400-wide canvas matches that.
  const spawnFruit = (st: FnState) => {
    // v48 reference odds: roughly one spawn in eight is the boom. The
    // port made it one in five — and the bigger hit area made bombs
    // easier to clip by accident, so blind sweeping died in ~20s.
    const kind = Math.random() < 0.12 ? "💣" : ["🍎", "🍊", "🍉", "🍇"][Math.floor(Math.random() * 4)];
    st.fruits.push({
      x: 40 + Math.random() * (FN_W - 80), y: FN_H + 20,
      vx: (Math.random() - 0.5) * 2, vy: -(7 + Math.random() * 3) * st.speed,
      kind, r: 34, rot: Math.random() * Math.PI * 2, vr: (Math.random() * 2 + 0.8) * (Math.random() < 0.5 ? -1 : 1) * 0.05,
    });
  };

  const spawnJuice = (st: FnState, f: FnFruit) => {
    const col = FN_JUICE[f.kind]?.juice ?? "#F2C230";
    for (let i = 0; i < 10; i++) {
      const dir = Math.random() * Math.PI * 2, dist = 3 + Math.random() * 6;
      st.parts.push({ x: f.x, y: f.y, vx: Math.cos(dir) * dist, vy: Math.sin(dir) * dist - 2, r: 2 + Math.random() * 4, color: col, life: 0, ttl: 0.9 });
    }
  };

  const sliceFruit = (f: FnFruit, ang: number, st: FnState) => {
    st.fruits = st.fruits.filter((v) => v !== f);
    if (f.kind === "💣") {
      // Bomb: red flash + dark/orange burst, costs a life (port rule).
      playSfx("boom", room.muted);
      st.flash = 0.65;
      for (let i = 0; i < 22; i++) {
        const dir = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 6;
        st.parts.push({ x: f.x, y: f.y, vx: Math.cos(dir) * sp, vy: Math.sin(dir) * sp, r: 2 + Math.random() * 5, color: i % 3 ? "#3A3F4A" : "#F08A1D", life: 0, ttl: 0.8 });
      }
      st.floats.push({ x: f.x, y: f.y, txt: "BOOM!", color: "#FF8580", life: 0 });
      livesRef.current--;
      setLives(livesRef.current);
      if (livesRef.current <= 0) { void end(scoreRef.current); return; }
      return;
    }
    // Sliced fruit splits into two halves with a juice burst (v48).
    playSfx("slice", room.muted);
    const px = Math.cos(ang + Math.PI / 2), py = Math.sin(ang + Math.PI / 2);
    const cols = FN_JUICE[f.kind] ?? FN_JUICE["🍎"];
    [-1, 1].forEach((s) => {
      st.halves.push({
        r: f.r, x: f.x, y: f.y, vx: f.vx + px * 4 * s, vy: f.vy + py * 4 * s - 1.5,
        rot: ang + (s > 0 ? 0 : Math.PI), vr: (Math.random() * 0.12 + 0.06) * s, life: 0,
        flesh: cols.flesh, skin: cols.skin, kind: f.kind,
      });
    });
    spawnJuice(st, f);
    st.floats.push({ x: f.x, y: f.y, txt: "+10", color: "#FFF6D8", life: 0 });
    scoreRef.current += 10;
    setScore(scoreRef.current);
    st.speed *= 1.02;
    if (Math.random() < 0.15) setCoins((n) => n + 1);
  };

  const end = useCallback(async (finalScore: number) => {
    cancelAnimationFrame(rafRef.current);
    setPlaying(false);
    const tier = [...FN_GOALS].reverse().find((g) => finalScore >= g.score);
    const payout = tier ? Math.round(stake * tier.mult) : 0;
    setMsg(tier ? `Score ${finalScore} — ×${tier.mult}! ${payout} coins` : `Score ${finalScore} — under 150, no payout.`);
    await room.settle(stake, payout, { score: finalScore, mult: tier?.mult ?? 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stake, room]);

  const start = () => {
    if (room.balance < stake) { setMsg("Not enough coins."); return; }
    // Round clock lives in the state ref: the old loop captured t0 in the
    // effect closure, and the effect re-ran (resetting t0) on every render
    // because `end` changes identity each render (useGameRoom returns a
    // fresh object). Result: TIME stuck at 45s while scoring and the
    // round never ended — settle never fired for an active player.
    const st: FnState = { fruits: [], halves: [], parts: [], floats: [], blades: [], speed: 1, t0: Date.now(), spawnT: 0, flash: 0, lastPt: null };
    stRef.current = st;
    for (let i = 0; i < 3; i++) spawnFruit(st);
    scoreRef.current = 0; livesRef.current = 3;
    setScore(0); setLives(3); setCoins(0); setTimeLeft(45); setPlaying(true);
  };

  useEffect(() => {
    if (!playing) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const W = cv.width, H = cv.height;
    const loop = () => {
      const st = stRef.current;
      if (!st) return;
      const elapsed = (Date.now() - st.t0) / 1000;
      const remain = Math.max(0, Math.ceil(45 - elapsed));
      setTimeLeft((prev) => (prev === remain ? prev : remain));
      if (elapsed >= 45) { void end(scoreRef.current); return; }
      // Volley spawner (v48): a volley every ~0.9s so the board reads as
      // fruit to slice, not one lonely fruit at a time.
      st.spawnT -= 1;
      if (st.spawnT <= 0) {
        st.spawnT = 54;
        const n = st.fruits.length < 2 ? 3 : 2;
        for (let i = 0; i < n; i++) spawnFruit(st);
      }
      st.fruits.forEach((f) => { f.x += f.vx; f.y += f.vy; f.vy += 0.18; f.rot += f.vr; });
      st.fruits = st.fruits.filter((f) => f.y < H + 60);
      st.halves.forEach((h) => { h.vy += 0.18; h.x += h.vx; h.y += h.vy; h.rot += h.vr; h.life += 0.016; });
      st.halves = st.halves.filter((h) => h.y < H + 60 && h.life < 1.3);
      st.parts.forEach((p) => { p.vy += 0.1; p.x += p.vx; p.y += p.vy; p.life += 0.016; });
      st.parts = st.parts.filter((p) => p.life < p.ttl);
      st.floats.forEach((fl) => { fl.y -= 1; fl.life += 0.016; });
      st.floats = st.floats.filter((fl) => fl.life < 0.85);
      st.blades.forEach((b) => { b.life += 16.7; });
      st.blades = st.blades.filter((b) => b.life < 200);
      if (st.flash > 0) st.flash = Math.max(0, st.flash - 0.03);
      // draw — deep green stage: vertical gradient + soft vignette so
      // the fruit sit on a real surface, not a flat colour.
      const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0, "#143B2E");
      bgGrad.addColorStop(0.55, "#0C2B22");
      bgGrad.addColorStop(1, "#071B15");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);
      const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.75);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(0,0,0,.34)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);
      st.halves.forEach((h) => {
        ctx.save();
        ctx.translate(h.x, h.y);
        ctx.rotate(h.rot);
        ctx.globalAlpha = Math.max(0, 1 - Math.max(0, h.life - 0.7) / 0.5);
        // Flesh: light at the cut face, shading to the skin edge.
        const fg = ctx.createRadialGradient(0, -h.r * 0.2, h.r * 0.1, 0, 0, h.r);
        fg.addColorStop(0, "#FFFDF4");
        fg.addColorStop(0.55, h.flesh);
        fg.addColorStop(1, h.skin);
        ctx.beginPath(); ctx.arc(0, 0, h.r, 0, Math.PI); ctx.closePath();
        ctx.fillStyle = fg; ctx.fill();
        ctx.lineWidth = h.r * 0.17; ctx.strokeStyle = h.skin; ctx.stroke();
        // Seeds on the cut face, per fruit.
        if (h.kind === "🍉") {
          ctx.fillStyle = "#1B1B22";
          [[-0.4, -0.3], [0, -0.45], [0.4, -0.3], [-0.2, -0.1], [0.25, -0.08]].forEach(([sx, sy]) => {
            ctx.beginPath(); ctx.ellipse(sx * h.r, sy * h.r, 2.2, 3.4, 0.3, 0, Math.PI * 2); ctx.fill();
          });
        } else if (h.kind === "🍎") {
          ctx.fillStyle = "#5E3A16";
          [[-0.25, -0.3], [0.25, -0.3]].forEach(([sx, sy]) => {
            ctx.beginPath(); ctx.ellipse(sx * h.r, sy * h.r, 2, 3, 0, 0, Math.PI * 2); ctx.fill();
          });
        }
        ctx.restore();
      });
      ctx.globalAlpha = 1;
      st.fruits.forEach((f) => {
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(f.rot);
        drawFnFruit(ctx, f.kind, f.r);
        ctx.restore();
      });
      st.parts.forEach((p) => {
        ctx.globalAlpha = Math.max(0, 1 - p.life / p.ttl);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 - (p.life / p.ttl) * 0.5), 0, 7); ctx.fill();
      });
      ctx.globalAlpha = 1;
      // The knife: a gold katana — wide gold glow underlay + bright core,
      // thinning as the swipe ages (round 17 impress; was silver-white).
      st.blades.forEach((b) => {
        const k = Math.max(0, 1 - b.life / 200);
        ctx.lineCap = "round";
        ctx.strokeStyle = `rgba(242,194,48,${0.35 * k})`;
        ctx.lineWidth = 3 + 16 * k;
        ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
        ctx.strokeStyle = `rgba(255,243,200,${0.95 * k})`;
        ctx.lineWidth = 1 + 6 * k;
        ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      });
      st.floats.forEach((fl) => {
        const k = fl.life / 0.85;
        ctx.globalAlpha = Math.max(0, 1 - k);
        ctx.fillStyle = fl.color;
        ctx.font = "800 21px Outfit, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(fl.txt, fl.x, fl.y - k * 46);
      });
      ctx.globalAlpha = 1;
      if (st.flash > 0) {
        ctx.fillStyle = `rgba(229,50,45,${Math.min(0.55, st.flash)})`;
        ctx.fillRect(0, 0, W, H);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, end]);

  // The knife follows the finger (v48): pointer capture on down, then
  // every move tests the whole swipe SEGMENT against each fruit — never
  // just the sampled point. pointerleave/up clears the segment start.
  const toLogical = (e: React.PointerEvent) => {
    const cv = canvasRef.current;
    if (!cv) return { x: 0, y: 0 };
    const r = cv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * FN_W, y: ((e.clientY - r.top) / r.height) * FN_H };
  };
  const beginSwipe = (e: React.PointerEvent) => {
    const st = stRef.current;
    if (!st || !playing) return;
    st.lastPt = toLogical(e);
    try { canvasRef.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  const moveSwipe = (e: React.PointerEvent) => {
    const st = stRef.current;
    if (!st || !playing) return;
    const pt = toLogical(e);
    const last = st.lastPt;
    if (!last) { st.lastPt = pt; return; }
    const dx = pt.x - last.x, dy = pt.y - last.y;
    if (dx * dx + dy * dy < 9) return;
    st.blades.push({ x1: last.x, y1: last.y, x2: pt.x, y2: pt.y, life: 0 });
    if (st.blades.length > 16) st.blades.shift();
    const ang = Math.atan2(dy, dx);
    for (const f of [...st.fruits]) {
      if (segHitsEllipse(last.x, last.y, pt.x, pt.y, f.x, f.y, f.r + 18)) sliceFruit(f, ang, st);
    }
    st.lastPt = pt;
  };
  const endSwipe = () => {
    const st = stRef.current;
    if (st) st.lastPt = null;
  };

  return (
    <RoomShell game={game} subtitle="Slice the fruit, dodge the bombs. Score 150 → ×2, 250 → ×3, 400 → ×4 in 45 seconds." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency="coins" disabled={playing} />
        <div className="rs-hud"><span>SCORE <b>{score}</b></span><span>LIVES <b>{"♥".repeat(Math.max(0, lives))}</b></span><span>COINS <b>{coins}</b></span><span>TIME <b>{timeLeft}s</b></span></div>
        <div style={{ position: "relative" }}>
          <canvas ref={canvasRef} width={400} height={420} className={playing ? "rs-canvas live" : "rs-canvas"} onPointerDown={beginSwipe} onPointerMove={moveSwipe} onPointerUp={endSwipe} onPointerCancel={endSwipe} onPointerLeave={endSwipe} aria-label="Fruit Ninja — drag across fruit to slice" />
          {!playing && <div className="fn-idle"><b>Swipe to slice</b><span>Fruit = 10 pts · combos ×2/×3 · coins +25 pts · powerups hide in the volleys · a bomb ends the round on the spot</span></div>}
        </div>
        {!playing && <button className="btn btn-gold xg-action" type="button" onClick={start}>Start slicing · {stake} coins</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}
