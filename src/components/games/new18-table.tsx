// Round 18 — table games: Baccarat, Three Card Poker, Sic Bo,
// Jacks or Better. Real cards and dice, drawn DOM art, standard rules
// (Baccarat third-card tableau, 3CP Pair Plus + dealer qualifier,
// Sic Bo Big/Small + totals, JoB paytable). Payouts are total-return
// multipliers on the stake, capped by each game's maxMultiplier.
// Refs: yfadskch/baccarat (dealing + totals),
// felipeAguiarCode/three-card-poker-simulator (3-card hand eval),
// hrach347/jacksOrBetter-game (JoB hand ranking),
// erangamapa/lucky-spin (Sic Bo table + dice).

"use client";

import { useRef, useState } from "react";
import { fmtMoney } from "../../lib/api";
import { GameDef } from "../../lib/games";
import { playSfx } from "../../lib/store";
import { RoomShell, StakeChips, useGameRoom } from "./shared";

type Suit = "♠" | "♥" | "♦" | "♣";
interface Card { rank: number; suit: Suit } // rank 2–14 (11 J, 12 Q, 13 K, 14 A)
const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
const RANK_LABEL: Record<number, string> = { 11: "J", 12: "Q", 13: "K", 14: "A" };
const RED = (s: Suit) => s === "♥" || s === "♦";

function newDeck(): Card[] {
  const d: Card[] = [];
  for (const s of SUITS) for (let r = 2; r <= 14; r++) d.push({ rank: r, suit: s });
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}
function label(c: Card) { return (RANK_LABEL[c.rank] ?? String(c.rank)) + c.suit; }

function CrownArt() {
  return (
    <svg viewBox="0 0 40 26" aria-hidden="true" className="crown">
      <path d="M4 22 L2 8 L11 14 L20 3 L29 14 L38 8 L36 22 Z" fill="#F2C230" stroke="#7A5200" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="20" cy="9" r="2.4" fill="#E5322D" stroke="#7A0F0F" strokeWidth=".8" />
      <circle cx="7" cy="12" r="1.8" fill="#E5322D" />
      <circle cx="33" cy="12" r="1.8" fill="#E5322D" />
      <rect x="4" y="22" width="32" height="3.4" rx="1.4" fill="#C99612" stroke="#7A5200" strokeWidth=".8" />
    </svg>
  );
}

function CardView({ c, back, onClick, held, dim }: { c?: Card; back?: boolean; onClick?: () => void; held?: boolean; dim?: boolean }) {
  if (back || !c) return <div className="v18-card back" aria-hidden="true"><span className="backpat" aria-hidden="true" /></div>;
  const rank = RANK_LABEL[c.rank] ?? String(c.rank);
  const face = c.rank >= 11 && c.rank <= 13;
  return (
    <button type="button" className={`v18-card${RED(c.suit) ? " red" : ""}${held ? " held" : ""}${onClick ? " clickable" : ""}`} style={dim ? { opacity: 0.45 } : undefined} onClick={onClick} aria-label={label(c)}>
      <span className="ci tl"><b>{rank}</b><i>{c.suit}</i></span>
      <span className="cp">{face ? <><CrownArt /><i className="cps">{c.suit}</i></> : c.rank === 14 ? <i className="cps ace">{c.suit}</i> : <i className="cps">{c.suit}</i>}</span>
      <span className="ci br"><b>{rank}</b><i>{c.suit}</i></span>
    </button>
  );
}

// ---------- Baccarat ----------
// Standard tableau: naturals (8/9) stand; Player draws on 0–5;
// Banker draws on 0–2, on 3 unless Player's third is 8, on 4 if
// Player's third is 2–7, on 5 if 4–7, on 6 if 6–7, stands on 7.
const baccVal = (c: Card) => (c.rank === 14 ? 1 : c.rank >= 10 ? 0 : c.rank);
const baccTotal = (cs: Card[]) => cs.reduce((s, c) => s + baccVal(c), 0) % 10;

export function BaccaratRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(10);
  const [pick, setPick] = useState<"player" | "banker" | "tie">("player");
  const [phase, setPhase] = useState<"idle" | "dealing" | "done">("idle");
  const [pc, setPc] = useState<Card[]>([]);
  const [bc, setBc] = useState<Card[]>([]);
  const [msg, setMsg] = useState("Pick a side — Player or Banker pays ×2, a Tie pays ×9. Closest to 9 wins.");
  const timersRef = useRef<number[]>([]);

  const deal = async () => {
    if (phase === "dealing") return;
    if (room.balance < stake) { setMsg("Balance too low for that stake."); return; }
    setPhase("dealing");
    setPc([]); setBc([]);
    playSfx("deal", room.muted);
    const deck = newDeck();
    const p = [deck[0], deck[2]];
    const b = [deck[1], deck[3]];
    let next = 4;
    let pThird: Card | null = null;
    let bThird: Card | null = null;
    const pt = baccTotal(p), bt = baccTotal(b);
    if (pt < 8 && bt < 8) {
      if (pt <= 5) { pThird = deck[next++]; }
      const pv = pThird ? baccVal(pThird) : -1;
      const drawB = bt <= 2 || (bt === 3 && pv !== 8) || (bt === 4 && pv >= 2 && pv <= 7) || (bt === 5 && pv >= 4 && pv <= 7) || (bt === 6 && pv >= 6 && pv <= 7);
      if (drawB) bThird = deck[next++];
    }
    const finalP = pThird ? [...p, pThird] : p;
    const finalB = bThird ? [...b, bThird] : b;
    const fp = baccTotal(finalP), fb = baccTotal(finalB);
    const winner = fp > fb ? "player" : fb > fp ? "banker" : "tie";
    const mult = winner === pick ? (winner === "tie" ? 9 : 2) : 0;
    const payout = Math.round(stake * mult * 100) / 100;
    const steps: [number, () => void][] = [
      [250, () => setPc([p[0]])],
      [500, () => setBc([b[0]])],
      [750, () => setPc([p[0], p[1]])],
      [1000, () => setBc([b[0], b[1]])],
    ];
    if (pThird) steps.push([1300, () => setPc(finalP)]);
    if (bThird) steps.push([1600, () => setBc(finalB)]);
    steps.push([1900, () => {
      setPhase("done");
      setMsg(winner === "tie" ? `Tie ${fp}–${fb} — ${mult ? `Tie pays ×9! ${fmtMoney(payout, room.user?.currency ?? "GHS")}` : "no win."}` : `${winner === "player" ? "Player" : "Banker"} ${winner === "player" ? fp : fb} beats ${winner === "player" ? fb : fp} — ${mult ? `you called it! ${fmtMoney(payout, room.user?.currency ?? "GHS")}` : "not your side."}`);
      void room.settle(stake, payout, { pick, winner, p: fp, b: fb });
    }]);
    steps.forEach(([ms, fn]) => { timersRef.current.push(window.setTimeout(fn, ms)); });
  };

  return (
    <RoomShell game={game} subtitle="Baccarat — closest to 9 wins. Player/Banker pays ×2, Tie pays ×9." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency="cash" disabled={phase === "dealing"} />
        <div className="v18-picks" role="group" aria-label="Bet on">
          {(["player", "banker", "tie"] as const).map((p) => (
            <button key={p} type="button" aria-pressed={pick === p} onClick={() => setPick(p)} disabled={phase === "dealing"}>
              {p === "player" ? "Player ×2" : p === "banker" ? "Banker ×2" : "Tie ×9"}
            </button>
          ))}
        </div>
        <div className="v18-handlab">Player <span>{pc.length ? baccTotal(pc) : "—"}</span></div>
        <div className="v18-cards" aria-label="Player hand">{pc.length ? pc.map((c, i) => <CardView key={i} c={c} />) : <CardView back />}</div>
        <div className="v18-handlab">Banker <span>{bc.length ? baccTotal(bc) : "—"}</span></div>
        <div className="v18-cards" aria-label="Banker hand">{bc.length ? bc.map((c, i) => <CardView key={i} c={c} />) : <CardView back />}</div>
        {phase !== "dealing" && <button className="btn btn-gold xg-action" type="button" onClick={() => void deal()}>{phase === "done" ? `Deal again · ${fmtMoney(stake, room.user?.currency ?? "GHS")}` : `Deal · ${fmtMoney(stake, room.user?.currency ?? "GHS")}`}</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}

// ---------- Three Card Poker ----------
// Ante vs the dealer (dealer qualifies with Queen-high or better) +
// Pair Plus on your own hand: Pair ×2, Flush ×3, Straight ×4,
// Trips or Straight Flush ×5. Payout is the better of the two.
function eval3CP(cards: Card[]): { rank: number; name: string; tb: number[] } {
  const vals = cards.map((c) => c.rank);
  const flush = cards.every((c) => c.suit === cards[0].suit);
  const counts = new Map<number, number>();
  vals.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const desc = [...vals].sort((a, b) => b - a);
  const asc = [...vals].sort((a, b) => a - b);
  const isA23 = vals.includes(14) && vals.includes(2) && vals.includes(3);
  const isStraight = isA23 || (new Set(vals).size === 3 && asc[2] - asc[0] === 2);
  const straightHigh = isA23 ? 3 : desc[0];
  if (flush && isStraight) return { rank: 5, name: "Straight Flush", tb: [straightHigh] };
  if (groups[0][1] === 3) return { rank: 4, name: "Three of a Kind", tb: [groups[0][0]] };
  if (isStraight) return { rank: 3, name: "Straight", tb: [straightHigh] };
  if (flush) return { rank: 2, name: "Flush", tb: desc };
  if (groups[0][1] === 2) return { rank: 1, name: "Pair", tb: [groups[0][0], ...vals.filter((v) => v !== groups[0][0]).sort((a, b) => b - a)] };
  return { rank: 0, name: "High Card", tb: desc };
}
function cmp3CP(a: { rank: number; tb: number[] }, b: { rank: number; tb: number[] }): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.max(a.tb.length, b.tb.length); i++) {
    const d = (a.tb[i] ?? 0) - (b.tb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function ThreeCardPokerRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(10);
  const [phase, setPhase] = useState<"idle" | "dealt" | "done">("idle");
  const [ph, setPh] = useState<Card[]>([]);
  const [dh, setDh] = useState<Card[]>([]);
  const [msg, setMsg] = useState("You get 3 cards, the dealer gets 3. Beat the dealer for ×2 — a Pair or better also pays Pair Plus, up to ×5.");

  const deal = async () => {
    if (room.balance < stake) { setMsg("Balance too low for that stake."); return; }
    setPhase("dealt");
    playSfx("deal", room.muted);
    const deck = newDeck();
    const p = deck.slice(0, 3);
    const d = deck.slice(3, 6);
    setPh(p);
    setDh(d);
    const pe = eval3CP(p);
    const de = eval3CP(d);
    const qualifies = de.rank > 0 || (de.rank === 0 && de.tb[0] >= 12);
    const pairPlus = pe.rank === 5 || pe.rank === 4 ? 5 : pe.rank === 3 ? 4 : pe.rank === 2 ? 3 : pe.rank === 1 ? 2 : 0;
    let ante = 0;
    if (!qualifies) ante = 1;
    else { const c = cmp3CP(pe, de); ante = c > 0 ? 2 : c === 0 ? 1 : 0; }
    const mult = Math.max(ante, pairPlus);
    const payout = Math.round(stake * mult * 100) / 100;
    setPhase("done");
    setMsg(
      `You: ${pe.name} · Dealer: ${de.name}${qualifies ? "" : " (dealer does not qualify)"} — ` +
      (mult === 0 ? "dealer wins, no Pair Plus." : mult === pairPlus && pairPlus > ante ? `Pair Plus pays ×${pairPlus}! ${fmtMoney(payout, room.user?.currency ?? "GHS")}` : ante === 2 ? `you beat the dealer! ${fmtMoney(payout, room.user?.currency ?? "GHS")}` : `ante pushes, stake back. ${fmtMoney(payout, room.user?.currency ?? "GHS")}`)
    );
    await room.settle(stake, payout, { player: pe.name, dealer: de.name, qualifies, mult });
  };

  const reset = () => { setPhase("idle"); setPh([]); setDh([]); };

  return (
    <RoomShell game={game} subtitle="Three Card Poker — beat the dealer for ×2, or let Pair Plus pay up to ×5." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency="cash" disabled={phase === "dealt"} />
        <div className="v18-handlab">Your hand <span>{ph.length ? eval3CP(ph).name : "—"}</span></div>
        <div className="v18-cards" aria-label="Your hand">{ph.length ? ph.map((c, i) => <CardView key={i} c={c} />) : <><CardView back /><CardView back /><CardView back /></>}</div>
        <div className="v18-handlab">Dealer <span>{phase === "done" && dh.length ? eval3CP(dh).name : "—"}</span></div>
        <div className="v18-cards" aria-label="Dealer hand">{dh.length ? dh.map((c, i) => <CardView key={i} c={c} />) : <><CardView back /><CardView back /><CardView back /></>}</div>
        {phase !== "dealt" && <button className="btn btn-gold xg-action" type="button" onClick={() => { if (phase === "done") reset(); void deal(); }}>{phase === "done" ? `Deal again · ${fmtMoney(stake, room.user?.currency ?? "GHS")}` : `Deal · ${fmtMoney(stake, room.user?.currency ?? "GHS")}`}</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}

// ---------- Sic Bo ----------
// Three dice. Big (11–17) / Small (4–10) pay ×2 and lose on any triple.
// A named total pays: 4/17 ×6, 5/16 ×5, 6/15 ×4, 7/14 ×3, 8/13 ×2,
// 9/12 ×2, 10/11 ×2.
const SIC_TOTALS: Record<number, number> = { 4: 6, 17: 6, 5: 5, 16: 5, 6: 4, 15: 4, 7: 3, 14: 3, 8: 2, 13: 2, 9: 2, 12: 2, 10: 2, 11: 2 };
const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]], 2: [[30, 30], [70, 70]], 3: [[28, 28], [50, 50], [72, 72]],
  4: [[30, 30], [70, 30], [30, 70], [70, 70]], 5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[30, 28], [70, 28], [30, 50], [70, 50], [30, 72], [70, 72]],
};
function Die({ v, rolling }: { v: number; rolling: boolean }) {
  return (
    <div className={`v18-die${rolling ? " rolling" : ""}`} aria-label={`Die showing ${v}`}>
      {PIPS[v].map(([x, y], i) => <i key={i} style={{ left: `${x}%`, top: `${y}%` }} />)}
    </div>
  );
}

export function SicBoRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(10);
  const [bet, setBet] = useState<string>("big");
  const [dice, setDice] = useState<[number, number, number]>([2, 4, 6]);
  const [rolling, setRolling] = useState(false);
  const [msg, setMsg] = useState("Pick Big, Small or a total — then roll the three dice.");

  const roll = async () => {
    if (rolling) return;
    if (room.balance < stake) { setMsg("Balance too low for that stake."); return; }
    setRolling(true);
    playSfx("blip", room.muted);
    const d: [number, number, number] = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
    const iv = window.setInterval(() => setDice([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]), 90);
    window.setTimeout(() => {
      window.clearInterval(iv);
      setDice(d);
      setRolling(false);
      const total = d[0] + d[1] + d[2];
      const triple = d[0] === d[1] && d[1] === d[2];
      let mult = 0;
      if (bet === "big") mult = !triple && total >= 11 && total <= 17 ? 2 : 0;
      else if (bet === "small") mult = !triple && total >= 4 && total <= 10 ? 2 : 0;
      else mult = total === Number(bet) ? SIC_TOTALS[total] : 0;
      const payout = Math.round(stake * mult * 100) / 100;
      setMsg(`Rolled ${d.join(" + ")} = ${total}${triple ? " — TRIPLE!" : ""} — ${mult > 0 ? `win ×${mult}! ${fmtMoney(payout, room.user?.currency ?? "GHS")}` : "no win."}`);
      void room.settle(stake, payout, { bet, dice: d, total, triple, mult });
    }, 750);
  };

  return (
    <RoomShell game={game} subtitle="Sic Bo — three dice. Big/Small pays ×2 (triples lose), a named total pays up to ×6." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency="cash" disabled={rolling} />
        <div className="v18-picks" role="group" aria-label="Big or small">
          <button type="button" aria-pressed={bet === "big"} onClick={() => setBet("big")} disabled={rolling}>Big 11–17 · ×2</button>
          <button type="button" aria-pressed={bet === "small"} onClick={() => setBet("small")} disabled={rolling}>Small 4–10 · ×2</button>
        </div>
        <div className="v18-picks" role="group" aria-label="Pick a total">
          {Object.keys(SIC_TOTALS).map((t) => (
            <button key={t} type="button" aria-pressed={bet === t} onClick={() => setBet(t)} disabled={rolling}>{t} · ×{SIC_TOTALS[Number(t)]}</button>
          ))}
        </div>
        <div className="v18-dice" aria-label="Dice">
          {dice.map((v, i) => <Die key={i} v={v} rolling={rolling} />)}
        </div>
        <button className="btn btn-gold xg-action" type="button" onClick={() => void roll()} disabled={rolling}>{rolling ? "Rolling…" : `Roll · ${fmtMoney(stake, room.user?.currency ?? "GHS")}`}</button>
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}

// ---------- Jacks or Better ----------
// Five-card draw video poker. Hold cards, draw once. Paytable:
// Royal ×10, Straight Flush ×8, Four of a Kind ×5, Full House ×4,
// Flush ×3, Straight ×2, Three of a Kind ×2, Two Pair ×1,
// Jacks or Better ×1.
function evalPoker(cards: Card[]): { name: string; mult: number } {
  const vals = cards.map((c) => c.rank).sort((a, b) => a - b);
  const flush = cards.every((c) => c.suit === cards[0].suit);
  const counts = new Map<number, number>();
  vals.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
  const groups = [...counts.values()].sort((a, b) => b - a);
  const uniq = [...new Set(vals)];
  const straight = uniq.length === 5 && (uniq[4] - uniq[0] === 4 || uniq.join(",") === "2,3,4,5,14");
  const isRoyal = flush && straight && uniq[0] === 10;
  if (isRoyal) return { name: "Royal Flush", mult: 10 };
  if (flush && straight) return { name: "Straight Flush", mult: 8 };
  if (groups[0] === 4) return { name: "Four of a Kind", mult: 5 };
  if (groups[0] === 3 && groups[1] === 2) return { name: "Full House", mult: 4 };
  if (flush) return { name: "Flush", mult: 3 };
  if (straight) return { name: "Straight", mult: 2 };
  if (groups[0] === 3) return { name: "Three of a Kind", mult: 2 };
  if (groups[0] === 2 && groups[1] === 2) return { name: "Two Pair", mult: 1 };
  if (groups[0] === 2) {
    const pairVal = [...counts.entries()].find(([, n]) => n === 2)![0];
    if (pairVal >= 11) return { name: "Jacks or Better", mult: 1 };
  }
  return { name: "No win", mult: 0 };
}

export function JacksOrBetterRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(10);
  const [hand, setHand] = useState<Card[]>([]);
  const [held, setHeld] = useState<boolean[]>([false, false, false, false, false]);
  const [phase, setPhase] = useState<"idle" | "held" | "done">("idle");
  const [msg, setMsg] = useState("Five cards — tap the ones to hold, then draw. Jacks or better pays, Royal Flush pays ×10.");
  const deckRef = useRef<Card[]>([]);

  const deal = () => {
    if (room.balance < stake) { setMsg("Balance too low for that stake."); return; }
    playSfx("deal", room.muted);
    const deck = newDeck();
    deckRef.current = deck;
    setHand(deck.slice(0, 5));
    setHeld([false, false, false, false, false]);
    setPhase("held");
    setMsg("Tap cards to hold them, then hit Draw.");
  };

  const draw = async () => {
    const deck = deckRef.current;
    let next = 5;
    const final = hand.map((c, i) => (held[i] ? c : deck[next++]));
    setHand(final);
    setPhase("done");
    const ev = evalPoker(final);
    const payout = Math.round(stake * ev.mult * 100) / 100;
    setMsg(ev.mult > 0 ? `${ev.name}! Pays ×${ev.mult} — ${fmtMoney(payout, room.user?.currency ?? "GHS")}` : `${ev.name} — no win. Deal again.`);
    await room.settle(stake, payout, { hand: final.map(label), result: ev.name, mult: ev.mult });
  };

  return (
    <RoomShell game={game} subtitle="Jacks or Better — hold the cards you want, draw once, Royal Flush pays ×10." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency="cash" disabled={phase === "held"} />
        <div className="v18-cards" aria-label="Your hand" style={{ flexWrap: "wrap" }}>
          {hand.length ? hand.map((c, i) => <CardView key={`${i}-${label(c)}`} c={c} held={held[i]} onClick={phase === "held" ? () => setHeld((h) => { const n = [...h]; n[i] = !n[i]; return n; }) : undefined} />) : <><CardView back /><CardView back /><CardView back /><CardView back /><CardView back /></>}
        </div>
        <p className="v18-sub">{phase === "held" ? "Tap cards to hold them — held cards lift up in gold." : phase === "done" ? "Round settled — deal again." : "Deal five cards to start."}</p>
        {phase === "idle" && <button className="btn btn-gold xg-action" type="button" onClick={deal}>Deal · {fmtMoney(stake, room.user?.currency ?? "GHS")}</button>}
        {phase === "held" && <button className="btn btn-gold xg-action" type="button" onClick={() => void draw()}>Draw</button>}
        {phase === "done" && <button className="btn btn-gold xg-action" type="button" onClick={deal}>Deal again · {fmtMoney(stake, room.user?.currency ?? "GHS")}</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}
