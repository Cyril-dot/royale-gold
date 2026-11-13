// Homepage — v48: hero, games grid (31 games, 6 shown + "Show all games"
// links to /games), Top Players podium + live wins feed, how-it-works,
// promotions, footer.

"use client";

import Link from "next/link";
import { useState } from "react";
import Hero from "../components/Hero";
import GameTile from "../components/GameTile";
import VerbTilt from "../components/VerbTilt";
import { BottleRoom } from "../components/games/quick";
import { getGame } from "../lib/games";
import { LIVE_WINS, TILE_GAMES, TOP_PLAYERS } from "../lib/tiles";
import { fmtCash } from "../lib/api";

// The homepage Bottle showcase plays the same room as
// /games/spin-da-bottle (the artifact's #bottle section, playable on
// the homepage itself).
const BOTTLE_GAME = getGame("spin-da-bottle")!;

// Podium avatar initials ("Kwame A." → "KA") and the artifact's
// no-decimals podium amounts (GH₵ 12,480, not GH₵ 12,480.00).
const initials = (name: string) =>
  name.split(/[\s.]+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const fmtPodium = (n: number) => `GH₵ ${n.toLocaleString("en-GH")}`;

export default function Home() {
  const [filter, setFilter] = useState<"all" | "cash" | "coins" | "crash">("all");
  const shown = TILE_GAMES.filter((g) =>
    filter === "all" ? true : filter === "crash" ? g.meta.tag === "crash" : g.currency === filter
  );

  return (
    <main id="top">
      <Hero />

      <section className="block" id="games">
        <div className="wrap">
          <div className="sec-head">
            <span className="sec-tag">The floor</span>
            <h2>All the <em>games</em></h2>
          </div>
          <div className="gp-filters" role="group" aria-label="Filter games">
            {(["all", "cash", "coins", "crash"] as const).map((f) => (
              <button key={f} type="button" className="fchip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === "all" ? "All games" : f === "cash" ? "Cash · GH₵" : f === "coins" ? "Coins" : "Crash"}
              </button>
            ))}
          </div>
          <div className="games">
            {shown.map((g, i) => (
              // The Bottle tile always shows and never counts toward the
              // six — the artifact's rule (v48: "the first FOUR visible
              // games plus the Bottle tile"; the games module tags every
              // game past the fourth .g-extra except the Bottle tile,
              // which never takes the tag). The port keeps six; the
              // Bottle tile is exempted so it shows in the collapsed
              // phone grid without tapping "Show all".
              <GameTile key={g.slug} g={g} extra={i >= 6 && g.slug !== "spin-da-bottle"} />
            ))}
          </div>
          {shown.length > 6 && (
            <Link className="btn btn-ghost games-more" href="/games">
              Show all games
            </Link>
          )}
        </div>
      </section>

      {/* Spin Da' Bottle, playable on the homepage — the artifact's
          #bottle saloon showcase, right after the games grid. Round 8:
          the homepage version is the bare variant — NO section header
          (the tile above already names the game) and NO mode bar (the
          header already carries the mode switch). The room below is the
          same BottleRoom as /games/spin-da-bottle, same logic, same
          payouts — only the chrome differs. */}
      <section className="block bottle-sec" id="bottle">
        <div className="wrap">
          <BottleRoom game={BOTTLE_GAME} variant="home" />
        </div>
      </section>

      <section className="block" id="top-players">
        <div className="wrap">
          <div className="sec-head">
            <span className="sec-tag">Leaderboard</span>
            <h2>This week&rsquo;s <em>top players</em></h2>
          </div>
          {/* Podium phone override: the artifact's .pod cells keep the
              3-column laptop composition on mobile (gap 8px, 6px ≤380px).
              globals.css stacks .podium to 1 column below 700px (the
              288d092 fix for the old .pod-step rows); .podium.podium
              (0,3,0) outranks it (0,2,0) at any load order. A CSS Module
              was tried first and REMOVED — this repo's next.config.ts
              routes *.css through the Tailwind loader, so .module.css
              files are bundled as plain global CSS and the import
              resolves to undefined. */}
          <style>{`@media (max-width:700px){.pod-wrap .podium.podium{grid-template-columns:1fr 1.15fr 1fr;gap:8px}}@media (max-width:380px){.pod-wrap .podium.podium{gap:6px}}`}</style>
          <div className="pod-wrap">
            <div className="podium" id="podium">
              {[2, 1, 3].map((rank) => {
                const p = TOP_PLAYERS[rank - 1];
                return (
                  <div key={p.name} className={`pod pod-${rank}`}>
                    <div className="who">
                      <span className="ava" aria-hidden="true">{initials(p.name)}</span>
                      <b>{p.name}</b>
                      <span>{p.game}</span>
                      <div className="amt">{fmtPodium(p.amount)}</div>
                    </div>
                    <div className="base" aria-hidden="true">#{rank}</div>
                  </div>
                );
              })}
            </div>
            <div className="pod-rest">
              {TOP_PLAYERS.slice(3).map((p, i) => (
                <div key={p.name} className="p-row">
                  <span className="rank">#{i + 4}</span>
                  <span className="who"><b>{p.name}</b><span>{p.game}</span></span>
                  <span className="won">{fmtPodium(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>
          <aside className="live-feed" aria-label="Live wins feed">
            <h3><span className="live-dot" /> Live wins</h3>
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
            <article className="verb"><VerbTilt index={0}><span className="vnum">STEP 01</span><div className="v-art" aria-hidden="true"><div className="coin-stack3d"><i /><i /><i /><i /><i /></div><span className="cn-solo">₵</span></div><h3>Depo<em>sit</em></h3><p>Top up from GH₵ 10 — MoMo, bank or card. Instant, no fees.</p></VerbTilt></article>
            <article className="verb"><VerbTilt index={1}><span className="vnum">STEP 02</span><div className="v-art" aria-hidden="true"><div className="cube cube-a"><i className="fc f-front p5" /><i className="fc f-back p2" /><i className="fc f-right p3" /><i className="fc f-left p4" /><i className="fc f-top p1" /><i className="fc f-bottom p6" /></div><div className="cube cube-b"><i className="fc f-front p3" /><i className="fc f-back p4" /><i className="fc f-right p5" /><i className="fc f-left p2" /><i className="fc f-top p6" /><i className="fc f-bottom p1" /></div></div><h3>Pl<em>ay</em></h3><p>Stakes from GH₵ 1. Every game&rsquo;s RTP is on its tile.</p></VerbTilt></article>
            <article className="verb"><VerbTilt index={2}><span className="vnum">STEP 03</span><div className="v-art" aria-hidden="true"><div className="fan"><i className="note n1" /><i className="note n2" /><i className="note n3">GH₵</i></div></div><h3>Cash <em>out</em></h3><p>Cash out to the same MoMo number. Most land in under five minutes.</p></VerbTilt></article>
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
              <p>We match your first top-up, plus 50 free spins. 18+. Wagering ×35 applies.</p>
            </div>
            <a className="btn" href="#promos">Claim the bonus</a>
          </article>
        </div>
      </section>

      {/* FAQ — the artifact's "Questions, answered straight", verbatim. */}
      <section className="block" id="faq">
        <div className="wrap">
          <div className="sec-head">
            <span className="sec-tag">Good to know</span>
            <h2>Questions, <em>answered straight</em></h2>
          </div>
          <div className="faq">
            <details>
              <summary><span className="fnum">01</span><span className="fq">Is this real-money play?</span><span className="fx" aria-hidden="true">+</span></summary>
              <p>Yes — deposits, stakes and winnings are real Ghana cedis. You must be 18 or older and pass a quick ID check before your first withdrawal, as Ghanaian gaming law requires.</p>
            </details>
            <details>
              <summary><span className="fnum">02</span><span className="fq">How fast are withdrawals?</span><span className="fx" aria-hidden="true">+</span></summary>
              <p>MoMo cash-outs are automatic and usually land in under five minutes. Bank withdrawals take up to one working day. There are no withdrawal fees on our side.</p>
            </details>
            <details>
              <summary><span className="fnum">03</span><span className="fq">Can I practise without money?</span><span className="fx" aria-hidden="true">+</span></summary>
              <p>Every game has a Demo button with a play-money balance. The games play identically — only the money is pretend, so you can learn the ropes risk-free.</p>
            </details>
            <details>
              <summary><span className="fnum">04</span><span className="fq">Are the games fair?</span><span className="fx" aria-hidden="true">+</span></summary>
              <p>The live build is designed around a certified, independently audited random number generator. Each game&rsquo;s return-to-player (RTP) is printed on its tile, and your full bet history is always available in your account.</p>
            </details>
          </div>

          <div className="resp">
            <div className="age" aria-label="18 plus only">18+</div>
            <div>
              <h3>Play responsibly</h3>
              <p>Casino games are entertainment, not a way to make money. Set a deposit limit before you start, never chase losses, and take breaks. If gambling stops being fun, free and confidential help is available — and you can self-exclude from your account settings at any time. Under-18s are strictly prohibited.</p>
            </div>
          </div>
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
