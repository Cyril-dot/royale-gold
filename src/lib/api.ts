// API client for the Royale Gold contract (API_CONTRACT.md).
// All balances come from the server — never trust client-side balances.
import { symbolFor } from "./country";

export interface User {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: "user" | "admin" | "owner";
  cash: number;
  coins: number;
  sim: number;
  xp: number;
  level: number;
  commissionPct: number | null;
  active: boolean;
  referredByAdminId: string | null;
  referralCodeUsed: string | null;
  createdAt: string;
  // P0 Batch 3 (O2/O3): the admin's allowed sections, or null = all.
  permissions: string[] | null;
  // P0 Batch 3 (A13): whether TOTP 2FA is enabled.
  totpEnabled: boolean;
  // P2 Batch 2 (O28): the player's birthday (YYYY-MM-DD) or null — the
  // loyalty birthday bonus pays on it, once per year.
  birthday: string | null;
  // Phase 1 country-based (Nov 2026): ISO country code chosen at
  // register + the fiat derived from it. This user's cash amounts are
  // always in this currency.
  country: string | null;
  currency: string;
}

export interface Wallet {
  cash: number;
  coins: number;
  sim: number;
  // Phase 1 country-based (Nov 2026): the wallet's fiat + country.
  currency: string;
  country: string | null;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

// Phase 1 country-based (Nov 2026): the fiat-aware money formatter.
// Pass the user's currency — a ₦ amount must never print as GH₵.
// `fmtCash` below stays as the GHS alias for the rare call site that
// genuinely cannot know the currency (a system-wide total with no
// owner, etc.) — prefer fmtMoney everywhere else.
export const fmtMoney = (n: number, currency: string = "GHS") =>
  symbolFor(currency) + " " + Number(n || 0).toFixed(2);

/** GHS alias of fmtMoney — only for call sites that cannot know the currency. */
export const fmtCash = (n: number) => "GH₵ " + Number(n || 0).toFixed(2);
export const fmtCoins = (n: number) => `${Math.round(n || 0)}`;
export const money = (n: number) => Math.round(Number(n || 0) * 100) / 100;

export interface GameStat {
  game: string;
  played: number;
  wins: number;
  losses: number;
  streak: number;
  best: number;
}
export interface GameHistoryRow {
  id: string;
  game: string;
  currency: string;
  // Phase 1 country-based (Nov 2026): the fiat this round was played in.
  fiatCurrency: string;
  stake: number;
  payout: number;
  result: Record<string, unknown>;
  createdAt: string;
}
