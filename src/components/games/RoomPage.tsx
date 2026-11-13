// Game room dispatcher — one route per game slug (client switch).

"use client";

import { notFound } from "next/navigation";
import { getGame } from "../../lib/games";
import CrashRoom from "./crash";
import PenaltyRoom from "./penalty";
import MinesRoom from "./mines";
import PlinkoRoom from "./plinko";
import { CoinFlipRoom, DiceRoom, WheelRoom, HiLoRoom, RpsRoom, LimboRoom, RedBlackRoom, WarRoom, PickBoxRoom, MiniRouletteRoom, BottleRoom } from "./quick";
import { KenoRoom, MemoryRoom, WhackRoom, ScratchRoom } from "./coin";
import { BlackjackRoom, PokerRoom, RouletteRoom } from "./table";
import { CarCrashRoom, RocketShooterRoom, FruitNinjaRoom } from "./arcade";
import { CandyRoom, TetrisRoom, TriviaRoom, SnakeRoom, Game2048Room } from "./skill";
// Round 18 — new games live in their own files; the existing 31 rooms
// are untouched.
import { BalloonBurstRoom } from "./new18-crash";
import { GoldenReelsRoom } from "./new18-slots";
import { BaccaratRoom, ThreeCardPokerRoom, SicBoRoom, JacksOrBetterRoom } from "./new18-table";
import { TowerClimbRoom, GoldenCatchRoom, GoldRushDerbyRoom } from "./new18-arcade";
import { BingoBlitzRoom, BrickBreakerRoom, StackTowerRoom, BubbleShooterRoom, BullseyeDartsRoom, ConnectFourRoom } from "./new18-coins";

export default function RoomPage({ slug }: { slug: string }) {
  const game = getGame(slug);
  if (!game) notFound();

  switch (slug) {
    case "aviator-gold": return <CrashRoom game={game} skin="aviator" />;
    case "jet-fly": return <CrashRoom game={game} skin="jet" />;
    case "car-crash": return <CarCrashRoom game={game} />;
    case "rocket-shooter": return <RocketShooterRoom game={game} />;
    case "penalty-shoot-out": return <PenaltyRoom game={game} />;
    case "mines": return <MinesRoom game={game} />;
    case "plinko": return <PlinkoRoom game={game} />;
    case "coin-flip": return <CoinFlipRoom game={game} />;
    case "dice-roll": return <DiceRoom game={game} />;
    case "lucky-wheel": return <WheelRoom game={game} />;
    case "hi-lo": return <HiLoRoom game={game} />;
    case "rock-paper-scissors": return <RpsRoom game={game} />;
    case "limbo": return <LimboRoom game={game} />;
    case "red-or-black": return <RedBlackRoom game={game} />;
    case "war": return <WarRoom game={game} />;
    case "pick-a-box": return <PickBoxRoom game={game} />;
    case "mini-roulette": return <MiniRouletteRoom game={game} />;
    case "texas-poker-room": return <PokerRoom game={game} />;
    case "spin-da-bottle": return <BottleRoom game={game} />;
    case "blackjack-vip": return <BlackjackRoom game={game} />;
    case "royale-roulette": return <RouletteRoom game={game} />;
    case "fruit-ninja": return <FruitNinjaRoom game={game} />;
    case "candy-crush": return <CandyRoom game={game} />;
    case "tetris": return <TetrisRoom game={game} />;
    case "whack-a-mole": return <WhackRoom game={game} />;
    case "memory-match": return <MemoryRoom game={game} />;
    case "scratch-card": return <ScratchRoom game={game} />;
    case "keno": return <KenoRoom game={game} />;
    case "trivia": return <TriviaRoom game={game} />;
    case "snake": return <SnakeRoom game={game} />;
    case "2048": return <Game2048Room game={game} />;
    // Round 18 — 15 new games.
    case "balloon-burst": return <BalloonBurstRoom game={game} />;
    case "golden-reels": return <GoldenReelsRoom game={game} />;
    case "baccarat": return <BaccaratRoom game={game} />;
    case "three-card-poker": return <ThreeCardPokerRoom game={game} />;
    case "sic-bo": return <SicBoRoom game={game} />;
    case "tower-climb": return <TowerClimbRoom game={game} />;
    case "golden-catch": return <GoldenCatchRoom game={game} />;
    case "gold-rush-derby": return <GoldRushDerbyRoom game={game} />;
    case "jacks-or-better": return <JacksOrBetterRoom game={game} />;
    case "bingo-blitz": return <BingoBlitzRoom game={game} />;
    case "brick-breaker": return <BrickBreakerRoom game={game} />;
    case "stack-tower": return <StackTowerRoom game={game} />;
    case "bubble-shooter": return <BubbleShooterRoom game={game} />;
    case "bullseye-darts": return <BullseyeDartsRoom game={game} />;
    case "connect-four": return <ConnectFourRoom game={game} />;
    default: notFound();
  }
}
