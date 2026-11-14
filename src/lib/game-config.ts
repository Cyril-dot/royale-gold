// P0 Batch 2 — owner control: per-game economics, kill switches,
// payment-method control, wallet config.
//
// Effective config = the catalogue default (src/lib/games.ts) overlaid
// with the owner's row where one exists. A game with NO GameConfig row
// runs on the catalogue defaults: visible, not killed, no bet/payout
// caps, the catalogue maxMultiplier. Null numeric = no override.
//
// All readers here are server-side only (API routes + settle). The
// public GET /api/games/config exposes the same effective values to the
// games page and the room gate.

import { prisma } from "./prisma";
import { getGame, ALL_GAMES, type GameDef } from "./games";
import { dec, round2 } from "./money";
import type { Prisma } from "@prisma/client";

/** Deposit methods the demo cashier accepts (same list as the deposit route). */
export const PAYMENT_METHODS = ["MTN", "Telecel", "AirtelTigo", "card"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface EffectiveGameConfig {
  slug: string;
  name: string;
  currency: "cash" | "coins";
  visible: boolean;
  killed: boolean;
  /** Null = no per-game override (platform min stake applies). */
  minBet: number | null;
  /** Null = no cap. */
  maxBet: number | null;
  /** Null = no cap. */
  maxPayout: number | null;
  maxMultiplier: number;
  note: string;
}

export interface PlatformSettingsShape {
  globalKill: boolean;
  cashMinDeposit: number;
  cashMinStake: number;
  coinMinStake: number;
  conversionRate: number;
  coinsWithdrawable: boolean;
}

export interface PaymentMethodShape {
  method: string;
  enabled: boolean;
  minDeposit: number | null;
  maxDeposit: number | null;
}

/** Platform defaults — what the code enforced before any owner row exists. */
export const PLATFORM_DEFAULTS: PlatformSettingsShape = {
  globalKill: false,
  cashMinDeposit: 1, // the deposit form's min={1}; the route had no floor before
  cashMinStake: 1, // the typed stake input's min on blur
  coinMinStake: 1, // coin stakes are whole coins
  conversionRate: 5, // GH₵5 = 1 coin (the old CONVERSION_RATE)
  coinsWithdrawable: false, // coins are play-only, never withdrawable
};

export async function getPlatformSettings(): Promise<PlatformSettingsShape> {
  const row = await prisma.platformSettings.findUnique({ where: { id: "global" } });
  if (!row) return { ...PLATFORM_DEFAULTS };
  return {
    globalKill: row.globalKill,
    cashMinDeposit: dec(row.cashMinDeposit),
    cashMinStake: dec(row.cashMinStake),
    coinMinStake: row.coinMinStake,
    conversionRate: dec(row.conversionRate),
    coinsWithdrawable: row.coinsWithdrawable,
  };
}

export function effectiveGameConfig(game: GameDef, row: {
  visible: boolean;
  killed: boolean;
  minBet: Prisma.Decimal | number | null;
  maxBet: Prisma.Decimal | number | null;
  maxPayout: Prisma.Decimal | number | null;
  maxMultiplier: Prisma.Decimal | number | null;
} | null): EffectiveGameConfig {
  return {
    slug: game.slug,
    name: game.name,
    currency: game.currency,
    visible: row?.visible ?? true,
    killed: row?.killed ?? false,
    minBet: row?.minBet == null ? null : dec(row.minBet),
    maxBet: row?.maxBet == null ? null : dec(row.maxBet),
    maxPayout: row?.maxPayout == null ? null : dec(row.maxPayout),
    maxMultiplier: row?.maxMultiplier == null ? game.maxMultiplier : dec(row.maxMultiplier),
    note: game.note,
  };
}

export async function getGameConfig(slug: string): Promise<EffectiveGameConfig | null> {
  const game = getGame(slug);
  if (!game) return null;
  const row = await prisma.gameConfig.findUnique({ where: { slug } });
  return effectiveGameConfig(game, row);
}

export async function getAllGameConfigs(): Promise<EffectiveGameConfig[]> {
  const rows = await prisma.gameConfig.findMany();
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  return ALL_GAMES.map((g) => effectiveGameConfig(g, bySlug.get(g.slug) ?? null));
}

/** True when the game cannot be played at all right now. */
export function isGameBlocked(cfg: EffectiveGameConfig, settings: PlatformSettingsShape): string | null {
  if (settings.globalKill) return "All games are paused by the owner";
  if (cfg.killed) return `${cfg.name} is currently unavailable`;
  if (!cfg.visible) return `${cfg.name} is currently unavailable`;
  return null;
}

/** Platform floor for the minimum stake in a currency. */
export function platformMinStake(currency: "cash" | "coins", settings: PlatformSettingsShape): number {
  return currency === "cash" ? settings.cashMinStake : settings.coinMinStake;
}

export async function getPaymentMethodConfig(method: string): Promise<PaymentMethodShape> {
  const row = await prisma.paymentMethodConfig.findUnique({ where: { method } });
  return {
    method,
    enabled: row?.enabled ?? true,
    minDeposit: row?.minDeposit == null ? null : dec(row.minDeposit),
    maxDeposit: row?.maxDeposit == null ? null : dec(row.maxDeposit),
  };
}

export async function getAllPaymentMethodConfigs(): Promise<PaymentMethodShape[]> {
  const rows = await prisma.paymentMethodConfig.findMany();
  const byMethod = new Map(rows.map((r) => [r.method, r]));
  return PAYMENT_METHODS.map((m) => {
    const row = byMethod.get(m);
    return {
      method: m,
      enabled: row?.enabled ?? true,
      minDeposit: row?.minDeposit == null ? null : dec(row.minDeposit),
      maxDeposit: row?.maxDeposit == null ? null : dec(row.maxDeposit),
    };
  });
}

/** Validate an owner-supplied money value for a game: cash 2dp, coins whole. */
export function validMoneyForGame(currency: "cash" | "coins", v: unknown): v is number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return false;
  if (currency === "coins" && !Number.isInteger(v)) return false;
  if (currency === "cash" && Math.abs(round2(v) - v) > 1e-9) return false;
  return true;
}
