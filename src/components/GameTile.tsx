// Game tile — v48 cardHTML, as a Next Link to the room.
// Covers use object-fit:contain with gradient side pillars, never cover,
// and carry no baked-in game names. Mines / Spin Da Bottle art tiles are
// full-bleed, shown whole and untouched. The glyph-only tiles now use the
// artifact's own cover art (SVG scenes extracted from the v48 file), and
// Blackjack VIP uses the artifact's CSS fan of cards — no glyph tile
// remains. Beginner tiles carry the g-beginner class / data-beginner
// attribute (the artifact's card tilt targets them) plus the TOP ×n and
// 1 TAP pills; every rich tile has the Demo button next to Play now.

"use client";

import Link from "next/link";
import { TileGame } from "../lib/tiles";
import { useStore } from "../lib/store";
import { useGameCardTilt } from "./VerbTilt";

const PLAY_ICON = (
  <svg aria-hidden="true" viewBox="0 0 24 24" width="13" height="13"><path fill="currentColor" d="M8 5v14l11-7z" /></svg>
);
const CASH_ICON = (
  <svg aria-hidden="true" viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M21 6H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1zm-9 7.5A2.5 2.5 0 1 1 14.5 11 2.5 2.5 0 0 1 12 13.5zM5.5 9h2v1.5h-2zm0 5h2V15.5h-2zm11-5h2v1.5h-2zm0 5h2v1.5h-2z" /></svg>
);
const COIN_ICON = (
  <svg aria-hidden="true" viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 3a7 7 0 1 1-7 7 7 7 0 0 1 7-7zm0 3a4 4 0 1 0 4 4 4 4 0 0 0-4-4z" /></svg>
);

export default function GameTile({ g, extra, simple }: { g: TileGame; extra?: boolean; simple?: boolean }) {
  const m = g.meta;
  const sizeCls = m.size === "hero" ? " g-hero" : m.size === "wide" ? " g-wide" : m.size === "tall" ? " g-tall" : " g-cell";
  const cur = g.currency === "coins" ? "coin" : "cash";
  const { toast } = useStore();
  useGameCardTilt();
  // Artifact's Demo button: a toast only — free play-money mode, same
  // game, no risk. It never opens the room.
  const demo = () => toast(`${g.name} — free play mode, same game, no risk.`, "info");

  // Games page: the export's simpler gp-card — art + name + Play now,
  // with the TOP ×n and 1 TAP pills on beginner art. Currency is an
  // icon only (top-right corner, below 1 TAP on beginner cards) —
  // no "GH₵ CASH" / "COINS" text anywhere.
  if (simple) {
    return (
      <article className="gp-card" data-cats={m.tag} data-beginner={m.beginner || undefined}>
        <div className="gp-art">
          {m.cssArt === "blackjack" ? (
            <div className="art-css art-blackjack"><div className="fan-cards" aria-hidden="true"><i>A♠</i><i className="red">K♥</i><i>J♣</i></div></div>
          ) : m.cover ? (
            <img className="cov" src={m.cover} alt="" />
          ) : (
            <div className="g-glyph" aria-hidden="true">{m.glyph}</div>
          )}
          {m.beginner && m.top && <span className="gp-win">TOP {m.top}</span>}
          {m.beginner && <span className="gp-1tap">1 TAP</span>}
          <span className={`g-cur-ico ${cur}${m.beginner ? " below-1tap" : ""}`} role="img" aria-label={cur === "coin" ? "Coin game" : "Cash game"}>
            {cur === "coin" ? COIN_ICON : CASH_ICON}
          </span>
        </div>
        <div className="gp-info">
          <h3>{g.name}</h3>
          <Link className="gp-play" href={`/games/${g.slug}`}>
            {PLAY_ICON}
            Play now
          </Link>
        </div>
      </article>
    );
  }

  if (m.fullArt && m.cover) {
    // Spin Da Bottle: the artifact's tile is the full-width .g-bottle
    // banner (grid-column 1/-1, aspect 1200/630) linking to the playable
    // section below — it never takes .g-extra and never links to a room.
    if (g.slug === "spin-da-bottle") {
      return (
        <a href="#bottle" className="game g-bottle" aria-label="Spin Da Bottle — play it in the section below">
          <img src={m.cover} alt={g.name} />
          <span className={`g-cur-ico ${cur}`} role="img" aria-label={cur === "coin" ? "Coin game" : "Cash game"}>
            {cur === "coin" ? COIN_ICON : CASH_ICON}
          </span>
        </a>
      );
    }
    return (
      <Link href={`/games/${g.slug}`} className={`game g-fullart${sizeCls}${extra ? " g-extra" : ""}`} aria-label={g.name}>
        <img src={m.cover} alt={g.name} />
        <span className={`g-cur-ico ${cur}`} role="img" aria-label={cur === "coin" ? "Coin game" : "Cash game"}>
          {cur === "coin" ? COIN_ICON : CASH_ICON}
        </span>
      </Link>
    );
  }

  return (
    <article className={`game${m.beginner ? " g-beginner" : ""}${sizeCls}${m.hideMobile ? " g-mobile-hide" : ""}${extra ? " g-extra" : ""}`}>
      <div className="g-art">
        {m.cssArt === "blackjack" ? (
          <div className="art-css art-blackjack"><div className="fan-cards" aria-hidden="true"><i>A♠</i><i className="red">K♥</i><i>J♣</i></div></div>
        ) : m.cover ? (
          <img src={m.cover} alt="" />
        ) : (
          <div className="g-glyph" aria-hidden="true">{m.glyph}</div>
        )}
      </div>
      <div className="g-shade" />
      {m.badge === "hot" && <span className="g-badge badge-hot">HOT</span>}
      {m.badge === "new" && <span className="g-badge badge-new">NEW</span>}
      {m.badge === "live" && <span className="g-badge badge-live"><i />LIVE</span>}
      {m.beginner && m.top && <span className="g-topwin">TOP {m.top}</span>}
      <span className="g-players"><i />{m.players.toLocaleString("en-GH")}</span>
      <span className="g-mult">{m.mult}</span>
      <span className={`g-cur-ico ${cur}`} role="img" aria-label={cur === "coin" ? "Coin game" : "Cash game"}>
        {cur === "coin" ? COIN_ICON : CASH_ICON}
      </span>
      <div className="g-info">
        <div className="g-txt">
          <h3>{g.name}</h3>
          <div className="g-meta">
            <span>Min <b>{m.min}</b></span>
            <span className="rtp">RTP <b>{m.rtp}</b></span>
            {m.beginner && <span className="g-1tap">1 TAP</span>}
          </div>
        </div>
        <div className="play-row">
          <Link className="play-btn" href={`/games/${g.slug}`}>{PLAY_ICON}Play now</Link>
          <button type="button" className="demo-btn" onClick={demo}>Free play</button>
        </div>
      </div>
    </article>
  );
}
