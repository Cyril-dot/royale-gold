// Round 21: per-game room header. The site header is hidden on
// /games/<slug> (Header.tsx), so rooms get their own premium header:
// back to all games, the cash balance AND the coins balance, the
// REAL/SIM toggle and the sound toggle. Balances read the store wallet
// directly, so they update live on play / settle / convert. The SIM
// top-up stays next to the balance in SIM mode (round 12) so a SIM
// session never strands the player with no way back.
"use client";

import Link from "next/link";
import { fmtCash, fmtCoins } from "../lib/api";
import { useStore } from "../lib/store";

export default function GameRoomHeader() {
  const { user, wallet, mode, setMode, muted, toggleMute, simSession, topUpSim } = useStore();
  const cash = wallet?.cash ?? user?.cash ?? 0;
  const coins = wallet?.coins ?? user?.coins ?? 0;
  const sim = simSession ?? wallet?.sim ?? user?.sim ?? 0;
  const simMode = mode === "SIM";

  return (
    <div className="grh">
      <div className="wrap grh-in">
        <div className="grh-top">
          <Link className="xg-back xg-back-icon grh-back" href="/games" aria-label="Back to all games">←</Link>
          <Link href="/wallet" className="grh-pill grh-cash" aria-label={simMode ? `SIM balance ${sim.toLocaleString("en-GH")} — open wallet` : `Cash balance ${fmtCash(cash)} — open wallet`}>
            <small>{simMode ? "SIM" : "Cash"}</small>
            <b>{simMode ? sim.toLocaleString("en-GH") : fmtCash(cash)}</b>
          </Link>
          <Link href="/wallet" className="grh-pill grh-coins" aria-label={`Coins balance ${fmtCoins(coins)} — open wallet`}>
            <small>Coins</small>
            <b><span aria-hidden="true">◉</span> {fmtCoins(coins)}</b>
          </Link>
        </div>
        <div className="grh-tools">
          {simMode && (
            <button type="button" className="xg-topup" onClick={topUpSim}>Top up SIM</button>
          )}
          <span className="xg-mode-btns" role="group" aria-label="Real or SIM cash">
            <button type="button" aria-pressed={mode === "REAL"} className={mode === "REAL" ? "on" : ""} onClick={() => setMode("REAL")}>REAL</button>
            <button type="button" aria-pressed={mode === "SIM"} className={mode === "SIM" ? "on" : ""} onClick={() => setMode("SIM")}>SIM</button>
          </span>
          <button className="icon-btn grh-mute" type="button" aria-label={muted ? "Unmute" : "Mute"} onClick={toggleMute}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4z" />{muted ? <path stroke="#E5322D" strokeWidth="2.4" strokeLinecap="round" d="M16.5 9.5l5 5M21.5 9.5l-5 5" /> : <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M16 9.5a3.4 3.4 0 0 1 0 5M18.4 7a6.6 6.6 0 0 1 0 10" />}</svg>
          </button>
        </div>
      </div>
    </div>
  );
}
