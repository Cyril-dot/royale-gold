// Game tile — v48 cardHTML, as a Next Link to the room.
// Covers use object-fit:contain with gradient side pillars, never cover,
// and carry no baked-in game names. Mines / Spin Da Bottle art tiles are
// full-bleed, shown whole and untouched.

"use client";

import Link from "next/link";
import { TileGame } from "../lib/tiles";

export default function GameTile({ g, extra }: { g: TileGame; extra?: boolean }) {
  const m = g.meta;
  const sizeCls = m.size === "hero" ? " g-hero" : m.size === "wide" ? " g-wide" : m.size === "tall" ? " g-tall" : " g-cell";
  const cur = g.currency === "coins" ? "coin" : "cash";

  if (m.fullArt && m.cover) {
    return (
      <Link href={`/games/${g.slug}`} className={`game g-fullart${sizeCls}${extra ? " g-extra" : ""}`} aria-label={g.name}>
        <img src={m.cover} alt={g.name} />
      </Link>
    );
  }

  return (
    <article className={`game${sizeCls}${m.hideMobile ? " g-mobile-hide" : ""}${extra ? " g-extra" : ""}`}>
      <div className="g-art">
        {m.cover ? (
          <img src={m.cover} alt="" />
        ) : (
          <div className="g-glyph" aria-hidden="true">{m.glyph}</div>
        )}
      </div>
      <div className="g-shade" />
      {m.badge === "hot" && <span className="g-badge badge-hot">HOT</span>}
      {m.badge === "new" && <span className="g-badge badge-new">NEW</span>}
      {m.badge === "live" && <span className="g-badge badge-live"><i />LIVE</span>}
      <span className="g-players"><i />{m.players.toLocaleString("en-GH")}</span>
      <span className="g-mult">{m.mult}</span>
      <span className={`g-cur ${cur}`}>
        {cur === "coin" ? "◉ COINS" : "GH₵ CASH"}
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
          <Link className="play-btn" href={`/games/${g.slug}`}>Play now</Link>
        </div>
      </div>
    </article>
  );
}
