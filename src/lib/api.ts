// API client for the Royale Gold contract (API_CONTRACT.md).
// All balances come from the server — never trust client-side balances.

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
}

export interface Wallet {
  cash: number;
  coins: number;
  sim: number;
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
  stake: number;
  payout: number;
  result: Record<string, unknown>;
  createdAt: string;
}
