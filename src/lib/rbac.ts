// P0 Batch 3 (O2/O3): per-section permissions for admins.
//
// An admin's allowed sections are stored as a JSON array of section keys
// on User.permissions. Null (or an empty array) = ALL sections allowed —
// backwards compatible: existing admins keep full access until the owner
// restricts them. The owner bypasses every permission check.
//
// Sections map 1:1 to the admin panel tabs (AdminNav) and to the admin
// API routes they guard. Every admin API route calls requirePermission
// after requireRole("admin"); every admin page hides the nav tab and
// shows a denial when the admin lacks the section.

import { AuthError } from "./errors";

/** The admin panel sections an owner can grant or revoke per admin. */
export const ADMIN_SECTIONS = [
  "overview",
  "referrals",
  "commission",
  "players",
  "money",
  "activity",
  "tickets",
  // P1 Batch 1 (A16): bet lookup + provably-fair verify.
  "lookup",
  // P1 Batch 2: KYC queue (A21), reports & export (A22), fraud alerts (A24).
  "kyc",
  "reports",
  "fraud",
  // P2 Batch 1: CRM campaigns (A25), tournaments (A27), live feed (A28).
  // VIP (A26) lives under "players"; responsible gambling (A29) too.
  "campaigns",
  "tournaments",
  "live",
] as const;

export type AdminSection = (typeof ADMIN_SECTIONS)[number];

/** Human labels for the permissions editor on the owner panel. */
export const ADMIN_SECTION_LABELS: Record<AdminSection, string> = {
  overview: "Overview",
  referrals: "Referrals",
  commission: "Commission",
  players: "Players",
  money: "Money",
  activity: "Activity log",
  tickets: "Tickets",
  lookup: "Bet lookup",
  kyc: "KYC",
  reports: "Reports",
  fraud: "Fraud alerts",
  campaigns: "CRM campaigns",
  tournaments: "Tournaments",
  live: "Live feed",
};

export function isAdminSection(value: string): value is AdminSection {
  return (ADMIN_SECTIONS as readonly string[]).includes(value);
}

/**
 * Parse the stored JSON permissions. Returns null = all sections allowed
 * (legacy admins with no permissions row, or an empty list — an owner
 * revoking everything is a deactivation, not an empty list). Accepts the
 * stored JSON string (server) or an already-parsed array (client user).
 */
export function parsePermissions(stored: string | string[] | null | undefined): AdminSection[] | null {
  if (!stored) return null;
  if (Array.isArray(stored)) {
    const kept = stored.filter((x): x is AdminSection => typeof x === "string" && isAdminSection(x));
    return kept.length === 0 ? null : kept;
  }
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return null;
    const kept = parsed.filter((x): x is AdminSection => typeof x === "string" && isAdminSection(x));
    return kept.length === 0 ? null : kept;
  } catch {
    return null;
  }
}

/** Serialise a section list for storage (null = all sections). */
export function serializePermissions(sections: AdminSection[] | null | undefined): string | null {
  if (!sections || sections.length === 0) return null;
  const kept = [...new Set(sections.filter(isAdminSection))];
  return kept.length === 0 ? null : JSON.stringify(kept);
}

/** True when this user may open the section. Owner bypasses everything. */
export function canAccessSection(
  user: { role: string; permissions?: string | string[] | null } | null | undefined,
  section: AdminSection,
): boolean {
  if (!user) return false;
  if (user.role === "owner") return true;
  if (user.role !== "admin") return false;
  const allowed = parsePermissions(user.permissions ?? null);
  if (allowed === null) return true;
  return allowed.includes(section);
}

/**
 * Server-side guard for admin API routes and pages. Throws a 403
 * AuthError when an admin lacks the section (owner always passes).
 */
export function requirePermission(
  user: { role: string; permissions?: string | string[] | null } | null | undefined,
  section: AdminSection,
): void {
  if (!canAccessSection(user, section)) {
    throw new AuthError(403, `You do not have access to the ${ADMIN_SECTION_LABELS[section]} section`);
  }
}
