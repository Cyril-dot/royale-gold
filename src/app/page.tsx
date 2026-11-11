// Homepage — v48: hero, rewards showcase directly under the hero,
// games grid (29 games, 6 shown + "Show all games" on phone), Top Players
// podium + live wins feed, how-it-works, promotions, footer.

"use client";

import Link from "next/link";
import { useState } from "react";
import Hero from "../components/Hero";
import RewardsStrip from "../components/RewardsStrip";
import GameTile from "../components/GameTile";
import { LIVE_WINS, TILE_GAMES, TOP_PLAYERS } from "../lib/tiles";
import { fmtCash } from "../lib/api";

export default function Home() {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<"all" | "cash" | "coins" | "crash">("all");
  const shown = TILE_GAMES.filter((g) =>
    filter === "all" ? true : filter === "crash" ? g.meta.tag === "crash" : g.currency === filter
  );

  return (
    <main id="top">
      <Hero />
      <RewardsStrip />

      <section className="block" id="games">
        <div className="wrap">
          <div className="sec-head">
            <span className="sec-tag">The floor</span>
            <h2>All the <em>games</em></h2>
            <p className="sec-sub">29 games · every one playable · cash in GH₵, coins for play</p>
          </div>
          <div className="gp-filters" role="group" aria-label="Filter games">
            {(["all", "cash", "coins", "crash"] as const).map((f) => (
              <button key={f} type="button" className="fchip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === "all" ? "All games" : f === "cash" ? "Cash · GH₵" : f === "coins" ? "Coins" : "Crash"}
              </button>
            ))}
            <Link className="fchip fchip-link" href="/games">Open all 29 →</Link>
          </div>
          <div className={`games${expanded ? " expanded" : ""}`}>
            {shown.map((g, i) => (
              <GameTile key={g.slug} g={g} extra={i >= 6} />
            ))}
          </div>
          {shown.length > 6 && (
            <button className="btn btn-ghost games-more" type="button" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Show fewer games" : `Show all games (${shown.length})`}
            </button>
          )}
        </div>
      </section>

      <section className="block" id="top-players">
        <div className="wrap">
          <div className="sec-head">
            <span className="sec-tag">Leaderboard</span>
            <h2>Top <em>players</em></h2>
          </div>
          <div className="pod-wrap">
            <div className="podium" id="podium">
              {TOP_PLAYERS.slice(0, 3).map((p, i) => (
                <div key={p.name} className={`pod-step p${i + 1}`}>
                  <span className="pod-rank">{i + 1}</span>
                  <b>{p.name}</b>
                  <span>{fmtCash(p.amount)}</span>
                  <small>{p.game}</small>
                </div>
              ))}
            </div>
            <div className="pod-rest">
              {TOP_PLAYERS.slice(3).map((p, i) => (
                <div key={p.name} className="pod-row"><span>{i + 4}</span><b>{p.name}</b><span>{fmtCash(p.amount)}</span><small>{p.game}</small></div>
              ))}
            </div>
            <p className="demo-note">Demo data only — connect your game backend to show real standings.</p>
          </div>
          <aside className="live-feed" aria-label="Live wins feed">
            <h3><span className="live-dot" /> Live wins</h3>
            <p>Demo feed — new wins slide in as they land.</p>
            <div className="feed-list">
              {LIVE_WINS.map((w) => (
                <div key={w.name + w.amount} className="feed-row"><b>{w.name}</b><span>won {fmtCash(w.amount)}</span><small>{w.game}</small></div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section className="block" id="how">
        <div className="wrap">
          <div className="sec-head">
            <span className="sec-tag">Start to cash-out</span>
            <h2>Three moves, <em>that&rsquo;s it</em></h2>
          </div>
          <div className="verbs">
            <article className="verb"><div className="verb-tilt"><span className="vnum">STEP 01</span><h3>Depo<em>sit</em></h3><p>Top up with MTN MoMo, Telecel Cash, AirtelTigo, bank or card. Money lands instantly, from GH₵ 10, no deposit fees.</p></div></article>
            <article className="verb"><div className="verb-tilt"><span className="vnum">STEP 02</span><h3>Pl<em>ay</em></h3><p>Stakes from GH₵ 1 across slots, crash, tables and arcade. Every result lands in your game history, and each game&rsquo;s RTP is printed on its tile.</p></div></article>
            <article className="verb"><div className="verb-tilt"><span className="vnum">STEP 03</span><h3>Cash <em>out</em></h3><p>Withdraw winnings back to the same MoMo number you deposited from. Most cash-outs complete in under five minutes.</p></div></article>
          </div>
        </div>
      </section>

      <section className="block" id="promos">
        <div className="wrap">
          <div className="sec-head">
            <span className="sec-tag">Promotions</span>
            <h2>More play for <em>your money</em></h2>
          </div>
          <article className="promo-gold">
            <div className="pg-txt">
              <div className="big">100% up to GH₵ 1,000 — welcome bonus</div>
              <p>We match your first top-up cedi for cedi, plus 50 free spins on Emerald Sevens. 18+. Wagering ×35 applies.</p>
            </div>
            <a className="btn" href="#promos">Claim the bonus</a>
          </article>
        </div>
      </section>

      <footer className="site">
        <div className="wrap">
          <div className="foot-top">
            <div>
              <strong style={{ color: "var(--ink)" }}>Royale Gold</strong> — sample homepage design.<br />
              Licensed gaming operator concept · Accra, Ghana · 18+ only. Play responsibly.
            </div>
            <nav className="foot-links" aria-label="Footer">
              <Link href="/games">Games</Link>
              <Link href="#promos">Promotions</Link>
              <Link href="#how">How it works</Link>
            </nav>
          </div>
          <div className="foot-name" aria-hidden="true">Royale <em>Gold</em></div>
          <p className="foot-legal">All balances, jackpots, player counts and winnings shown on this page are demo figures for the design sample.</p>
        </div>
      </footer>
    </main>
  );
}
