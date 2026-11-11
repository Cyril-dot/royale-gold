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
    default: notFound();
  }
}
