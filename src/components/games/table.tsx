// Table games — Blackjack VIP (blackjack 3:2, dealer stands 17),
// Texas Poker Room (heads-up Hold'em, best-5-of-7 evaluator ported
// verbatim from the v48 export), Royale Roulette (straight-up ×36).

"use client";

import { useState } from "react";
import { api, fmtCash } from "../../lib/api";
import { GameDef } from "../../lib/games";
import { playSfx, useStore } from "../../lib/store";
import { RoomShell, StakeChips, useGameRoom } from "./shared";

/** What POST /api/games/play returns for a roulette round. */
interface PlayResult {
  pocket: number;
  won: boolean;
  mult: number;
  payout: number;
  factor: number;
  mode: "REAL" | "SIM";
  cash?: number;
  coins?: number;
  sim?: number;
}

// ---------- cards (v48 port) ----------
export interface Card { rank: number; suit: number; sym: string; red: boolean }
const SUITS = [{ s: "♠", red: false }, { s: "♥", red: true }, { s: "♦", red: true }, { s: "♣", red: false }];
const RLAB: Record<number, string> = { 11: "J", 12: "Q", 13: "K", 14: "A" };
export function newDeck(): Card[] {
  const d: Card[] = [];
  for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) d.push({ rank: r, suit: s, sym: SUITS[s].s, red: SUITS[s].red });
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}
export const cardName = (c: Card) => (RLAB[c.rank] || c.rank) + c.sym;

const HAND_NAMES = ["High card", "Pair", "Two pair", "Three of a kind", "Straight", "Flush", "Full house", "Four of a kind", "Straight flush"];
export function eval5(cs: Card[]): number[] {
  const ranks = cs.map((c) => c.rank).sort((a, b) => b - a);
  const flush = cs.every((c) => c.suit === cs[0].suit);
  const uniq: number[] = [];
  ranks.forEach((r) => { if (!uniq.includes(r)) uniq.push(r); });
  let straight = false, sHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) { straight = true; sHigh = uniq[0]; }
    else if (uniq.join(",") === "14,5,4,3,2") { straight = true; sHigh = 5; }
  }
  const counts: Record<number, number> = {};
  ranks.forEach((r) => { counts[r] = (counts[r] || 0) + 1; });
  const groups = Object.keys(counts).map((r) => [counts[+r], +r] as [number, number]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  if (straight && flush) return [8, sHigh];
  if (groups[0][0] === 4) return [7, groups[0][1], groups[1][1]];
  if (groups[0][0] === 3 && groups[1][0] === 2) return [6, groups[0][1], groups[1][1]];
  if (flush) return [5, ...ranks];
  if (straight) return [4, sHigh];
  if (groups[0][0] === 3) return [3, groups[0][1], ...groups.slice(1).map((g) => g[1]).sort((a, b) => b - a)];
  if (groups[0][0] === 2 && groups[1][0] === 2) {
    const pairs = groups.filter((g) => g[0] === 2).map((g) => g[1]).sort((a, b) => b - a);
    const kick = groups.filter((g) => g[0] === 1).map((g) => g[1]);
    return [2, ...pairs, ...kick];
  }
  if (groups[0][0] === 2) return [1, groups[0][1], ...groups.slice(1).map((g) => g[1]).sort((a, b) => b - a)];
  return [0, ...ranks];
}
function cmpScore(a: number[], b: number[]) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return d;
  }
  return 0;
}
export function eval7(cs: Card[]): number[] {
  let best: number[] | null = null;
  for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) {
    const five = cs.filter((_, i) => i !== a && i !== b);
    const sc = eval5(five);
    if (!best || cmpScore(sc, best) > 0) best = sc;
  }
  return best!;
}
export function handName(sc: number[]) {
  if (sc[0] === 8 && sc[1] === 14) return "Royal flush";
  return HAND_NAMES[sc[0]];
}

export function PlayingCard({ c, back }: { c?: Card | null; back?: boolean }) {
  if (back || !c) return <div className="pcard back"><span className="st">♠</span></div>;
  return <div className={`pcard${c.red ? " red" : ""}`}><span className="rk">{RLAB[c.rank] || c.rank}</span><span className="st">{c.sym}</span></div>;
}

// ---------- Blackjack ----------
function bjValue(hand: Card[]): number {
  let total = 0, aces = 0;
  for (const c of hand) {
    if (c.rank === 14) { aces++; total += 11; }
    else total += Math.min(c.rank, 10);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}
export function BlackjackRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(25);
  const [msg, setMsg] = useState("Tap Hit to take a card or Stand to hold. Blackjack pays 3:2 and the dealer stands on 17.");
  const [deck, setDeck] = useState<Card[]>([]);
  const [you, setYou] = useState<Card[]>([]);
  const [dealer, setDealer] = useState<Card[]>([]);
  const [playing, setPlaying] = useState(false);
  const [hideHole, setHideHole] = useState(true);

  const deal = () => {
    const d = newDeck();
    const y = [d.pop()!, d.pop()!];
    const dl = [d.pop()!, d.pop()!];
    setDeck(d); setYou(y); setDealer(dl); setPlaying(true); setHideHole(true);
    if (bjValue(y) === 21) {
      setHideHole(false);
      setPlaying(false);
      const payout = Math.round(stake * 2.5 * 100) / 100;
      setMsg(`Blackjack! 3:2 pays ${fmtCash(payout)}.`);
      void room.settle(stake, payout, { blackjack: true });
    } else setMsg(`You have ${bjValue(y)}. Hit or stand?`);
  };
  const hit = () => {
    const d = [...deck];
    const c = d.pop()!;
    const y = [...you, c];
    setDeck(d); setYou(y);
    const v = bjValue(y);
    if (v > 21) {
      setPlaying(false); setHideHole(false);
      setMsg(`Bust — ${v}.`);
      void room.settle(stake, 0, { you: v, bust: true });
    } else setMsg(`You have ${v}. Hit or stand?`);
  };
  const stand = async () => {
    let d = [...deck];
    const dl = [...dealer];
    while (bjValue(dl) < 17) dl.push(d.pop()!);
    setDeck(d); setDealer(dl); setHideHole(false); setPlaying(false);
    const yv = bjValue(you), dv = bjValue(dl);
    if (dv > 21) { setMsg(`Dealer busts on ${dv} — you win ×2, ${fmtCash(stake * 2)}!`); await room.settle(stake, stake * 2, { you: yv, dealer: dv }); }
    else if (yv > dv) { setMsg(`${yv} beats ${dv} — you win ×2, ${fmtCash(stake * 2)}!`); await room.settle(stake, stake * 2, { you: yv, dealer: dv }); }
    else if (yv < dv) { setMsg(`${dv} beats ${yv} — stake gone.`); await room.settle(stake, 0, { you: yv, dealer: dv }); }
    else { setMsg(`Push on ${yv} — stake back.`); await room.settle(stake, stake, { you: yv, dealer: dv, push: true }); }
  };
  return (
    <RoomShell game={game} subtitle="Blackjack pays 3:2. Dealer stands on 17." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency="cash" disabled={playing} />
        <div className="bj-table">
          <div className="bj-row"><span>DEALER {dealer.length ? `· ${hideHole ? bjValue([dealer[0]]) : bjValue(dealer)}` : ""}</span><div className="qg-cardrow">{dealer.map((c, i) => <PlayingCard key={i} c={i === 1 && hideHole ? null : c} back={i === 1 && hideHole} />)}{dealer.length === 0 && <><PlayingCard /><PlayingCard /></>}</div></div>
          <div className="bj-row"><span>YOU {you.length ? `· ${bjValue(you)}` : ""}</span><div className="qg-cardrow">{you.map((c, i) => <PlayingCard key={i} c={c} />)}{you.length === 0 && <><PlayingCard /><PlayingCard /></>}</div></div>
        </div>
        {!playing && <button className="btn btn-gold xg-action" type="button" onClick={deal}>Deal · {fmtCash(stake)}</button>}
        {playing && (
          <div className="bj-btns">
            <button className="btn btn-gold" type="button" onClick={hit}>Hit</button>
            <button className="btn btn-ghost" type="button" onClick={() => void stand()}>Stand</button>
          </div>
        )}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}

// ---------- Texas Poker ----------
export function PokerRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const [stake, setStake] = useState(25);
  const [msg, setMsg] = useState("You and the dealer each get two cards, then the flop, turn and river land. Best 5 of 7 wins the pot — a tie hands the stake back.");
  const [you, setYou] = useState<Card[]>([]);
  const [dealer, setDealer] = useState<Card[]>([]);
  const [board, setBoard] = useState<Card[]>([]);
  const [stage, setStage] = useState(0); // 0 idle, 1 dealt, 2 showdown
  const [youHand, setYouHand] = useState("");
  const [dealerHand, setDealerHand] = useState("");

  const deal = () => {
    const d = newDeck();
    setYou([d.pop()!, d.pop()!]);
    setDealer([d.pop()!, d.pop()!]);
    setBoard([d.pop()!, d.pop()!, d.pop()!, d.pop()!, d.pop()!]);
    setStage(1); setYouHand(""); setDealerHand("");
    setMsg("Your hole cards are in — reveal the board for the showdown.");
  };
  const reveal = async () => {
    const ys = eval7([...you, ...board]);
    const ds = eval7([...dealer, ...board]);
    setYouHand(handName(ys));
    setDealerHand(handName(ds));
    setStage(2);
    const cmp = cmpScore(ys, ds);
    if (cmp > 0) { setMsg(`You win with ${handName(ys)} over ${handName(ds)} — ×2, ${fmtCash(stake * 2)}!`); await room.settle(stake, stake * 2, { you: handName(ys), dealer: handName(ds) }); }
    else if (cmp < 0) { setMsg(`Dealer wins with ${handName(ds)} over ${handName(ys)} — stake gone.`); await room.settle(stake, 0, { you: handName(ys), dealer: handName(ds) }); }
    else { setMsg(`Split pot — both ${handName(ys)}. Stake back.`); await room.settle(stake, stake, { you: handName(ys), dealer: handName(ds), push: true }); }
  };
  return (
    <RoomShell game={game} subtitle="Heads-up Hold'em · best 5 of 7 wins the pot · pays ×2." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency="cash" disabled={stage === 1} />
        <div className="qg-stage pk-stage">
          <div className="pk-rowlab">DEALER <span className="pk-handname">{dealerHand}</span></div>
          <div className="qg-cardrow pk-cards">{stage === 0 ? <><PlayingCard /><PlayingCard /></> : stage === 1 ? <><PlayingCard back /><PlayingCard back /></> : dealer.map((c, i) => <PlayingCard key={i} c={c} />)}</div>
          <div className="pk-rowlab">THE BOARD <span className="pk-pot">Pot {fmtCash(stake * 2)}</span></div>
          <div className="qg-cardrow pk-cards pk-board">{stage === 0 ? <><PlayingCard /><PlayingCard /><PlayingCard /><PlayingCard /><PlayingCard /></> : board.map((c, i) => <PlayingCard key={i} c={c} />)}</div>
          <div className="pk-rowlab">YOU <span className="pk-handname">{youHand}</span></div>
          <div className="qg-cardrow pk-cards">{stage === 0 ? <><PlayingCard /><PlayingCard /></> : you.map((c, i) => <PlayingCard key={i} c={c} />)}</div>
        </div>
        {stage === 0 && <button className="btn btn-gold xg-action" type="button" onClick={deal}>Deal a hand · {fmtCash(stake)}</button>}
        {stage === 1 && <button className="btn btn-gold xg-action" type="button" onClick={() => void reveal()}>Turn, river &amp; showdown</button>}
        {stage === 2 && <button className="btn btn-ghost xg-action" type="button" onClick={() => setStage(0)}>Deal again</button>}
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}

// ---------- Royale Roulette ----------
const RED_NUMS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
type BetKind = "straight" | "red" | "black" | "even" | "odd";
export function RouletteRoom({ game }: { game: GameDef }) {
  const room = useGameRoom(game);
  const { setWallet, setSimSession, simSession, toast, openAuth } = useStore();
  const [stake, setStake] = useState(10);
  const [msg, setMsg] = useState("Pick red, black, even, odd or a straight-up number, set your stake and spin. Straight-up pays ×36, red/black and even/odd pay ×2.");
  const [betKind, setBetKind] = useState<BetKind>("straight");
  const [pick, setPick] = useState(7);
  const [spun, setSpun] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);

  // Server-decided spin (round 6 economy): the server draws the pocket
  // with the SIM/LIVE win-chance factor applied and settles the round
  // atomically in REAL mode. The wheel animates while the draw runs and
  // lands on the server's pocket — the client never decides the outcome.
  const spin = async () => {
    if (spinning) return;
    if (!room.user) { openAuth("login"); return; }
    if (room.balance < stake) { toast(`Not enough ${room.simMode ? "SIM" : "cash"} — top up to play`, "lose"); return; }
    setSpinning(true);
    try {
      const playP = api<PlayResult>("/api/games/play", {
        method: "POST",
        body: JSON.stringify({ game: game.slug, currency: "cash", stake, mode: room.simMode ? "SIM" : "REAL", choice: { betKind, pick } }),
      });
      const [res] = await Promise.all([playP, new Promise((r) => setTimeout(r, 1100))]);
      const out = res.pocket;
      setSpun(out);
      setSpinning(false);
      const colour = out === 0 ? "green" : RED_NUMS.has(out) ? "red" : "black";
      setMsg(res.mult > 0 ? `Landed ${out} ${colour} — ×${res.mult}! ${fmtCash(res.payout)}` : `Landed ${out} ${colour} — no win.`);
      if (room.simMode) {
        setSimSession((simSession ?? 0) - stake + res.payout);
        room.pushHistory({ id: `sim-${Date.now()}`, game: game.slug, currency: "cash", stake, payout: res.payout, result: { bet: betKind, pick, out }, createdAt: new Date().toISOString() });
      } else if (res.cash !== undefined && res.coins !== undefined && res.sim !== undefined) {
        setWallet({ cash: res.cash, coins: res.coins, sim: res.sim });
        // Server history/stats only exist for REAL rounds. Refreshing here
        // in SIM mode would fetch the (empty) server history and wipe the
        // local SIM row just added above.
        await room.refreshStats();
      }
      const won = res.payout > stake;
      const simTag = room.simMode ? " (SIM)" : "";
      toast(won ? `You won ${fmtCash(res.payout)}${simTag}` : res.payout > 0 ? `${fmtCash(res.payout)} back${simTag}` : `You lost ${fmtCash(stake)}${simTag}`, won ? "win" : "lose");
      if (won) playSfx("cheer", room.muted); else if (res.payout === 0) playSfx("groan", room.muted);
    } catch (ex) {
      setSpinning(false);
      toast(ex instanceof Error ? ex.message : "Spin failed", "lose");
    }
  };
  return (
    <RoomShell game={game} subtitle="European wheel, 0–36. Straight-up pays ×36, red/black and even/odd pay ×2." stats={room.stats} history={room.history}>
      <div className="xg-controls">
        <StakeChips stake={stake} setStake={setStake} currency="cash" disabled={spinning} />
        <div className="rr-stage">
          <div className={`rr-wheel${spinning ? " spin" : ""}`}>{spun !== null ? spun : spinning ? "…" : "0"}</div>
          <div className="rr-bets" role="group" aria-label="Bet type">
            {(["straight", "red", "black", "even", "odd"] as BetKind[]).map((b) => (
              <button key={b} type="button" className="xg-pick" aria-pressed={betKind === b} onClick={() => setBetKind(b)}>{b === "straight" ? "Straight-up ×36" : b === "red" ? "Red ×2" : b === "black" ? "Black ×2" : b === "even" ? "Even ×2" : "Odd ×2"}</button>
            ))}
          </div>
          {betKind === "straight" && (
            <div className="mr-nums">
              {Array.from({ length: 37 }, (_, n) => (
                <button key={n} type="button" className={pick === n ? "on" : ""} onClick={() => setPick(n)}>{n}</button>
              ))}
            </div>
          )}
        </div>
        <button className="btn btn-gold xg-action" type="button" onClick={() => void spin()} disabled={spinning}>{spinning ? "Spinning…" : `Spin · ${fmtCash(stake)}`}</button>
        <p className="bottle-msg xg-msg">{msg}</p>
      </div>
    </RoomShell>
  );
}
