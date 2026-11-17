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
import { symbolFor } from "./country";
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
  // P1 Batch 4 (O21): platform settings & branding.
  siteName: string;
  supportContact: string;
  maintenanceMode: boolean;
}

export interface PaymentMethodShape {
  method: string;
  // Phase 1 country-based (Nov 2026): which fiat this row is for.
  fiatCurrency: string;
  gateway: string | null;
  enabled: boolean;
  minDeposit: number | null;
  maxDeposit: number | null;
}

// Phase 1 country-based (Nov 2026): per-currency platform rules.
// The owner's CurrencyConfig editor edits these — no code change
// needed to set NGN limits. This is the source of truth for min
// deposit / min stake / the cash→coins rate; PlatformSettings keeps
// the GHS row's values as its legacy fields and the two are kept in
// sync on write (see the owner wallet-config route).
export interface CurrencyConfigShape {
  currency: string;
  symbol: string;
  minDeposit: number;
  minStake: number;
  conversionRate: number; // fiat per 1 coin
  decayStep: number; // LIVE win-chance decay step for this fiat
  withdrawalOwnerThreshold: number; // withdrawals above this need the owner too
  enabled: boolean;
}

/** Seed defaults — the owner panel can change every one of these. */
export const CURRENCY_DEFAULTS: Record<string, CurrencyConfigShape> = {
  GHS: { currency: "GHS", symbol: "GH₵", minDeposit: 1, minStake: 1, conversionRate: 5, decayStep: 100, withdrawalOwnerThreshold: 500, enabled: true },
  // NGN seed values are 100x the GHS ones (same "effort") — Chuks sets
  // his own numbers in the owner panel; these are NOT the 7UP limits.
  NGN: { currency: "NGN", symbol: "₦", minDeposit: 100, minStake: 100, conversionRate: 500, decayStep: 10000, withdrawalOwnerThreshold: 50000, enabled: true },
};

function currencyRowToShape(row: {
  currency: string;
  symbol: string;
  minDeposit: Prisma.Decimal | number;
  minStake: Prisma.Decimal | number;
  conversionRate: Prisma.Decimal | number;
  decayStep: Prisma.Decimal | number;
  withdrawalOwnerThreshold: Prisma.Decimal | number;
  enabled: boolean;
}): CurrencyConfigShape {
  return {
    currency: row.currency,
    symbol: row.symbol,
    minDeposit: dec(row.minDeposit),
    minStake: dec(row.minStake),
    conversionRate: dec(row.conversionRate),
    decayStep: dec(row.decayStep),
    withdrawalOwnerThreshold: dec(row.withdrawalOwnerThreshold),
    enabled: row.enabled,
  };
}

/**
 * Per-currency rules, falling back to the seed defaults when no row
 * exists yet (a fresh DB, or a currency added before its row is
 * seeded). For GHS the PlatformSettings legacy fields are the fallback
 * when a settings object is passed, so the old wallet-config editor
 * and the new CurrencyConfig editor can never disagree.
 */
export async function getCurrencyConfig(
  currency: string,
  settings?: PlatformSettingsShape,
): Promise<CurrencyConfigShape> {
  const code = (currency || "GHS").toUpperCase();
  const row = await prisma.currencyConfig.findUnique({ where: { currency: code } });
  if (row) return currencyRowToShape(row);
  const def = CURRENCY_DEFAULTS[code];
  if (def) {
    if (code === "GHS" && settings) {
      return { ...def, minDeposit: settings.cashMinDeposit, minStake: settings.cashMinStake, conversionRate: settings.conversionRate };
    }
    return { ...def };
  }
  return {
    currency: code,
    symbol: symbolFor(code),
    minDeposit: 1,
    minStake: 1,
    conversionRate: 5,
    decayStep: 100,
    withdrawalOwnerThreshold: 500,
    enabled: true,
  };
}

/** Every known currency row (seed rows included), for the owner editor. */
export async function getAllCurrencyConfigs(): Promise<CurrencyConfigShape[]> {
  const rows = await prisma.currencyConfig.findMany({ orderBy: { currency: "asc" } });
  const byCode = new Map(rows.map((r) => [r.currency, currencyRowToShape(r)]));
  const out: CurrencyConfigShape[] = [];
  for (const code of Object.keys(CURRENCY_DEFAULTS)) {
    out.push(byCode.get(code) ?? { ...CURRENCY_DEFAULTS[code] });
  }
  for (const [code, shape] of byCode) {
    if (!CURRENCY_DEFAULTS[code]) out.push(shape);
  }
  return out;
}

/** Upsert one currency row (owner CurrencyConfig editor). */
export async function upsertCurrencyConfig(
  currency: string,
  patch: Partial<Omit<CurrencyConfigShape, "currency">>,
): Promise<CurrencyConfigShape> {
  const code = (currency || "GHS").toUpperCase();
  const current = await getCurrencyConfig(code);
  const next = { ...current, ...patch, currency: code };
  const row = await prisma.currencyConfig.upsert({
    where: { currency: code },
    update: {
      symbol: next.symbol,
      minDeposit: next.minDeposit,
      minStake: next.minStake,
      conversionRate: next.conversionRate,
      decayStep: next.decayStep,
      withdrawalOwnerThreshold: next.withdrawalOwnerThreshold,
      enabled: next.enabled,
    },
    create: {
      currency: code,
      symbol: next.symbol,
      minDeposit: next.minDeposit,
      minStake: next.minStake,
      conversionRate: next.conversionRate,
      decayStep: next.decayStep,
      withdrawalOwnerThreshold: next.withdrawalOwnerThreshold,
      enabled: next.enabled,
    },
  });
  return currencyRowToShape(row);
}

/**
 * Scale a GHS-denominated config amount into a player's fiat. Per-game
 * minBet / maxBet / maxPayout overrides are stored in GHS terms (the
 * owner sets them once); an NGN player sees them at the 100x scale
 * (conversionRate / 5). GHS players are unaffected (×1).
 */
export async function scaleGhsAmount(amount: number, fiatCurrency: string): Promise<number> {
  if ((fiatCurrency || "GHS").toUpperCase() === "GHS") return amount;
  const cfg = await getCurrencyConfig(fiatCurrency);
  return round2(amount * (cfg.conversionRate / 5));
}

/** Platform defaults — what the code enforced before any owner row exists. */
export const PLATFORM_DEFAULTS: PlatformSettingsShape = {
  globalKill: false,
  cashMinDeposit: 1, // the deposit form's min={1}; the route had no floor before
  cashMinStake: 1, // the typed stake input's min on blur
  coinMinStake: 1, // coin stakes are whole coins
  conversionRate: 5, // GH₵5 = 1 coin (the old CONVERSION_RATE)
  coinsWithdrawable: false, // coins are play-only, never withdrawable
  siteName: "Royale Gold",
  supportContact: "",
  maintenanceMode: false,
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
    siteName: row.siteName || PLATFORM_DEFAULTS.siteName,
    supportContact: row.supportContact || "",
    maintenanceMode: row.maintenanceMode,
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

/**
 * Phase 1 country-based (Nov 2026): the platform floor for the
 * minimum stake in the PLAYER'S fiat — CurrencyConfig.minStake for
 * cash (GHS 1 / NGN 100 seed), coinMinStake for coins.
 */
export async function platformMinStakeFiat(
  currency: "cash" | "coins",
  settings: PlatformSettingsShape,
  fiatCurrency: string = "GHS",
): Promise<number> {
  if (currency === "coins") return settings.coinMinStake;
  const cfg = await getCurrencyConfig(fiatCurrency, settings);
  return cfg.minStake;
}

export async function getPaymentMethodConfig(method: string, fiatCurrency: string = "GHS"): Promise<PaymentMethodShape> {
  const row = await prisma.paymentMethodConfig.findUnique({ where: { method_fiatCurrency: { method, fiatCurrency: fiatCurrency.toUpperCase() } } });
  return {
    method,
    fiatCurrency: fiatCurrency.toUpperCase(),
    gateway: row?.gateway ?? null,
    enabled: row?.enabled ?? true,
    minDeposit: row?.minDeposit == null ? null : dec(row.minDeposit),
    maxDeposit: row?.maxDeposit == null ? null : dec(row.maxDeposit),
  };
}

export async function getAllPaymentMethodConfigs(fiatCurrency: string = "GHS"): Promise<PaymentMethodShape[]> {
  const code = fiatCurrency.toUpperCase();
  const rows = await prisma.paymentMethodConfig.findMany({ where: { fiatCurrency: code } });
  const byMethod = new Map(rows.map((r) => [r.method, r]));
  return PAYMENT_METHODS.map((m) => {
    const row = byMethod.get(m);
    return {
      method: m,
      fiatCurrency: code,
      gateway: row?.gateway ?? null,
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
