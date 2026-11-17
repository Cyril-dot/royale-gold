import { prisma } from "@/lib/prisma";
import { parsePermissions } from "@/lib/rbac";

export interface PublicUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
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
  // P2 Batch 2 (O28): the player's birthday (YYYY-MM-DD) or null — the
  // loyalty birthday bonus pays on it, once per year.
  birthday: string | null;
  // Phase 1 country-based (Nov 2026): the country chosen at register
  // + the fiat the account always uses.
  country: string | null;
  currency: string;
  // P0 Batch 3 (O2/O3): the admin's allowed sections, or null = all.
  permissions: string[] | null;
  // P0 Batch 3 (A13): whether TOTP 2FA is enabled (the secret is never exposed).
  totpEnabled: boolean;
}

export function publicUser(u: {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  cashBalance: { toString(): string };
  coins: number;
  simBalance: { toString(): string };
  xp: number;
  level: number;
  commissionPct: { toString(): string } | null;
  active: boolean;
  referredByAdminId: string | null;
  referralCodeUsed: string | null;
  createdAt: Date;
  permissions?: string | null;
  totpEnabled?: boolean;
  birthday?: Date | null;
  // Phase 1 country-based (Nov 2026).
  country?: string | null;
  currency?: string | null;
}): PublicUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    cash: Number(u.cashBalance.toString()),
    coins: u.coins,
    sim: Number(u.simBalance.toString()),
    xp: u.xp,
    level: u.level,
    commissionPct: u.commissionPct === null ? null : Number(u.commissionPct.toString()),
    active: u.active,
    referredByAdminId: u.referredByAdminId,
    referralCodeUsed: u.referralCodeUsed,
    createdAt: u.createdAt.toISOString(),
    permissions: parsePermissions(u.permissions ?? null),
    totpEnabled: u.totpEnabled ?? false,
    birthday: u.birthday ? u.birthday.toISOString().slice(0, 10) : null,
    // Phase 1 country-based (Nov 2026): existing (pre-Phase-1) rows
    // carry null/"GHS" — the register path + the prod SQL default
    // every account to GH/GHS, so the client can always rely on these.
    country: u.country ?? "GH",
    currency: u.currency ?? "GHS",
  };
}

/** Normalize a referral code the way the UI sends it: uppercased, trimmed. */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L

export function randomCode(): string {
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `RG-${out}`;
}
