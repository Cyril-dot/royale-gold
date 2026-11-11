// Rewards showcase — directly under the hero, horizontal snap-scroll
// (swipe/drag, hidden scrollbar, edge fades, desktop arrows).
// Claims go through POST /api/rewards/claim. Retention rewards pay
// SIM/coins only — never the real cash wallet.

"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../lib/store";

interface Ach { key: string; name: string; target: number; progress: number; unlocked: boolean }
interface RewardsState {
  simClaimedToday: boolean;
  coinsClaimedToday: boolean;
  streakDay: number;
  xp: number;
  level: number;
  achievements: Ach[];
}

export default function RewardsStrip() {
  const { user, toast, refresh, muted } = useStore();
  const [rw, setRw] = useState<RewardsState | null>(null);
  const [busy, setBusy] = useState<"sim" | "coins" | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    if (!user) { setRw(null); return; }
    try {
      setRw(await api<RewardsState>("/api/rewards"));
    } catch {
      setRw(null);
    }
  };
  useEffect(() => { void load(); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const claim = async (type: "sim" | "coins") => {
    setBusy(type);
    try {
      const r = await api<{ type: string; streakDay: number; cash: number; coins: number; sim: number; xp: number; level: number }>("/api/rewards/claim", {
        method: "POST",
        body: JSON.stringify({ type }),
      });
      toast(type === "sim" ? "+100 SIM claimed" : "+5 coins claimed", "win");
      await refresh();
      await load();
      void r;
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Claim failed", "lose");
    } finally {
      setBusy(null);
    }
  };

  const scrollBy = (dir: number) => {
    stripRef.current?.scrollBy({ left: dir * 320, behavior: "smooth" });
  };
  void muted;

  const xpIntoLevel = rw ? rw.xp % 100 : 0;

  return (
    <section className="rewards-sec" aria-label="Rewards">
      <div className="wrap">
        <div className="rw-head">
          <div><span className="rw-lab">REWARDS</span><h2>Daily <em>rewards</em></h2></div>
          <div className="rw-arrows">
            <button className="rw-arrow flip" type="button" aria-label="Scroll rewards back" onClick={() => scrollBy(-1)}>←</button>
            <button className="rw-arrow" type="button" aria-label="Scroll rewards forward" onClick={() => scrollBy(1)}>→</button>
          </div>
        </div>
        <div className="rw-fadewrap">
          <div className="rw-strip" id="rwStrip" ref={stripRef}>
            <article className="rw-card rw-hero-card">
              <div className="rw-ico"><svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M12 6l1.5-2h2L14 6h4v3H6V6h6zm-6 5h12v9H6v-9zm2 2v5m6-5v5" stroke="currentColor" strokeWidth="1.6" fill="none"/></svg></div>
              <h4>Daily bonus</h4>
              <p>Two free claims, every day — SIM credits for the demo floor, and gold coins for the coin games.</p>
              <div className="rw-claims">
                <button className="rw-claim daily-btn" type="button" disabled={!user || rw?.simClaimedToday || busy === "sim"} onClick={() => void claim("sim")}>
                  {rw?.simClaimedToday ? "SIM claimed today ✓" : busy === "sim" ? "Claiming…" : "Claim daily bonus · +100 SIM"}
                </button>
                <button className="rw-claim" type="button" disabled={!user || rw?.coinsClaimedToday || busy === "coins"} onClick={() => void claim("coins")}>
                  <span><b>{rw?.coinsClaimedToday ? "Coins claimed today ✓" : "Claim daily coins"}</b><small>Gold coins · play-only, never withdrawable</small></span>
                  <span className="rw-claim-amt">+5 COINS</span>
                </button>
              </div>
              <div className="rw-streakline"><svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"><path fill="#FF9E2C" d="M12 2s1 3.5-1.5 6C8 10.5 7 12.3 7 14.5A5 5 0 0 0 17 14.5c0-1.2-.5-2.3-1-3.2-.3 1-1 1.7-2 2.2.5-3-.5-7.5-2-11.5z"/></svg><span>{rw && rw.streakDay > 0 ? `${rw.streakDay}-day claim streak` : "Claim today to start your streak"}</span></div>
              <div className="rw-count">{!user ? "Log in to claim your daily bonus" : ""}</div>
            </article>
            <article className="rw-card" id="rwStreakCard">
              <div className="rw-ico"><svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="#FF9E2C" d="M12 2s1 3.5-1.5 6C8 10.5 7 12.3 7 14.5A5 5 0 0 0 17 14.5c0-1.2-.5-2.3-1-3.2-.3 1-1 1.7-2 2.2.5-3-.5-7.5-2-11.5z"/></svg></div>
              <div className="rw-flame-num">{user ? (rw?.streakDay ?? 0) : 0}</div>
              <h4>Win streak</h4>
              <p>Win a round to light the flame.</p>
              <div className="rw-state">STREAK · {rw?.streakDay ?? 0} DAYS</div>
            </article>
            <article className="rw-card" id="rwXpCard">
              <div className="rw-ico"><svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="2" d="M7 4h10v5a5 5 0 0 1-10 0V4zM7 5H4a3 3 0 0 0 3 4M17 5h3a3 3 0 0 1-3 4M12 14v3M8 21h8M12 17l-1.5 4h3L12 17z"/></svg></div>
              <h4>Level <span>{rw?.level ?? 1}</span></h4>
              <p>Every round earns XP — +2 a round. Level-ups pay +50 SIM credits.</p>
              <div className="rw-prog"><i style={{ width: `${xpIntoLevel}%` }} /></div>
              <div className="rw-prog-lab"><span>{xpIntoLevel} / 100 XP</span><span>NEXT LEVEL</span></div>
              <div className="rw-state" style={{ color: "var(--gold-2)" }}>LEVEL-UP BONUS · +50 SIM</div>
            </article>
            {(rw?.achievements ?? []).map((a) => (
              <article key={a.key} className={`rw-card ach ${a.unlocked ? "on" : ""}`}>
                <div className="rw-ico">{a.unlocked ? "★" : "☆"}</div>
                <h4>{a.name}</h4>
                <p>{a.unlocked ? "Unlocked" : `${a.progress} / ${a.target}`}</p>
                <div className="rw-prog"><i style={{ width: `${Math.min(100, (a.progress / a.target) * 100)}%` }} /></div>
                <div className="rw-state">{a.unlocked ? "UNLOCKED · GOLD" : "LOCKED"}</div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
