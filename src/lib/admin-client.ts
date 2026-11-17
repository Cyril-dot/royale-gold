// Shared CLIENT admin-dashboard data (round 11): the admin panel is split
// into real routes (/admin, /admin/referrals, /admin/commission,
// /admin/players/[id]) — each page fetches what it needs from the same
// endpoints the old single-page AdminPanel used. No API route changed.
// (src/lib/admin.ts is the SERVER overview helper — different file.)
//
// P0 Batch 3 (O3): each page now loads its OWN data behind its own
// permission — the overview endpoint is gated by "overview", so the
// other pages no longer load it for their header. useAdminContext loads
// just the admin's identity (no section gate); useAdminReferrals,
// useAdminPlayers and useAdminHistory load each page's data from its own
// endpoint. In owner preview (?preview=<adminId>) every hook reads the
// preview endpoint instead (the owner bypasses permissions).

"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

export interface AdminIdentity {
  id: string;
  name: string;
  email: string;
  commissionPct: number;
  active: boolean;
  permissions: string[] | null;
}

export interface AdminOverview {
  admin: AdminIdentity;
  codes: { id: string; code: string; active: boolean; createdAt: string }[];
  referredUsers: { id: string; name: string; email: string | null; phone: string | null; referralCodeUsed: string | null; referredByAdminName: string | null; createdAt: string; country?: string | null; currency?: string }[];
  coinsGiven: number;
  redemptions: number;
  // Phase 1 country-based (Nov 2026): the fiat the commission +
  // history figures are in (the admin's currency by default).
  currency: string;
  commission: { today: number; yesterday: number; last7d: number; last30d: number; allTime: number };
  history: { date: string; deposits: number; totalAmount: number; totalCommission: number; totalStakes?: number; totalPayouts?: number; model?: string; rate?: number; parentSharePct?: number; fiatCurrency: string }[];
  // P1 Batch 4 (O24): the child admins rolled into these figures.
  scope: { childAdmins: { id: string; name: string }[] };
}

export interface DayDetail {
  date: string;
  // Phase 1 country-based (Nov 2026): the fiat this day's figures are in.
  fiatCurrency: string;
  deposits: { id: string; userId: string; userName: string; userContact: string; amount: number; method: string; fiatCurrency: string; pctInForce: number; commission: number; time: string; adminName: string }[];
  totals: { deposits: number; totalAmount: number; totalCommission: number; totalStakes?: number; totalPayouts?: number; model?: string; rate?: number };
  // P1 Batch 4 (O24): the child admins rolled into this day.
  scope: { childAdmins: { id: string; name: string }[] };
}

export interface UserDetail {
  // P1 Batch 4 (O24): true when the player is in a child admin's
  // downline — the detail page hides the action sections.
  readOnly: boolean;
  user: { id: string; name: string; email: string | null; phone: string | null; role: string; cash: number; coins: number; joinedAt: string; referralCodeUsed: string | null; referringAdmin: { id: string; name: string; email: string } | null; blockedAt: string | null; blockedReason: string | null; country?: string | null; currency?: string };
  deposits: { id: string; amount: number; method: string; fiatCurrency: string; pctInForce: number; commission: number; createdAt: string }[];
  totals: { deposits: number; totalDeposited: number; totalCommission: number; coinsGiven: number };
  // P0 Batch 4 (A3): bet/round history, KYC status, commission earned,
  // and support tickets.
  rounds: { id: string; game: string; gameName: string; currency: string; fiatCurrency: string; stake: number; payout: number; net: number; createdAt: string }[];
  // P1 Batch 2 (A21): the real KYC status — the latest submission, with
  // its document type, submitted date and rejection reason.
  kycStatus: "not_submitted" | "pending" | "approved" | "rejected";
  kycDocumentType: string | null;
  kycDocumentUrl: string | null;
  kycSubmittedAt: string | null;
  kycRejectionReason: string | null;
  commission: { total: number; model: string; rate: number; fiatCurrency: string };
  tickets: { id: string; subject: string; status: string; createdAt: string }[];
  // P1 Batch 1 (A19/A20): admin-only notes + tags, and per-player limits.
  notes: { id: string; text: string; authorId: string; authorName: string; createdAt: string }[];
  tags: string[];
  limits: { maxStake: number | null; maxDepositPerDay: number | null; maxLossPerDay: number | null; coolOffUntil: string | null; selfExcludedUntil: string | null; selfExclusionReason: string | null; realityCheckMinutes: number } | null;
  // P2 Batch 1 (A26): VIP status — the tier this player has reached
  // from their total deposited, plus progress to the next tier.
  vip: {
    totalDeposited: number;
    tier: { name: string; minDeposited: number; perks: string[] } | null;
    nextTier: { name: string; minDeposited: number } | null;
    progressPct: number;
    toNext: number;
  };
}

export interface AdminDashboardData {
  // Phase 1 country-based (Nov 2026): the fiat these figures are in.
  currency: string;
  today: { deposits: number; depositsTotal: number; newPlayers: number; activePlayers: number; commission: number };
  week: { date: string; deposits: number; total: number }[];
  topPlayers: { id: string; name: string; contact: string | null; deposits: number; totalDeposited: number }[];
  // P1 Batch 4 (O24): the child admins rolled into these figures.
  scope: { childAdmins: { id: string; name: string }[] };
}

export interface DownlineNode {
  id: string;
  name: string;
  contact: string | null;
  role: string;
  // Phase 1 country-based (Nov 2026): the player's country + fiat
  // (the server already returns them — see src/lib/admin.ts).
  country: string | null;
  fiatCurrency: string;
  totalDeposited: number;
  commission: number;
  commissionModel: string;
  commissionRate: number;
  children: DownlineNode[];
  deeper: boolean;
}

export interface ReferralsData {
  codes: { id: string; code: string; active: boolean; createdAt: string }[];
  referredUsers: { id: string; name: string; email: string | null; phone: string | null; referralCodeUsed: string | null; createdAt: string }[];
  coinsGiven: number;
  redemptions: number;
}

export function todayStr() { return new Date().toISOString().slice(0, 10); }

export function copyText(t: string) {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(t).catch(() => {
      const ta = document.createElement("textarea");
      ta.value = t;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    });
  }
  const ta = document.createElement("textarea");
  ta.value = t;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
  return Promise.resolve();
}

export function shareLink(code: string) {
  return `${typeof window !== "undefined" ? window.location.origin : ""}/?ref=${code}`;
}

/** The admin's identity for page headers (P0 Batch 3 O3). No section
 *  permission is needed — it is the admin's own identity. In preview
 *  mode it comes from the preview endpoint. */
export function useAdminContext(previewId: string | null) {
  const [ctx, setCtx] = useState<{ admin: AdminIdentity } | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      const url = previewId ? `/api/owner/admins/${previewId}/preview` : "/api/admin/context";
      const data = await api<{ admin: AdminIdentity }>(url);
      setCtx({ admin: data.admin });
      setErr("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not load admin panel.");
    }
  }, [previewId]);
  useEffect(() => { void load(); }, [load]);
  return { ctx, err, load };
}

/** Phase 1 country-based (Nov 2026): append ?currency= (or &currency=
 * when the URL already has a query) to a fetch URL. */
function withCurrency(url: string, currency?: string): string {
  if (!currency) return url;
  return `${url}${url.includes("?") ? "&" : "?"}currency=${encodeURIComponent(currency)}`;
}

/** Overview for the signed-in admin, or for the admin the owner is
 *  previewing (?preview=<adminId>). Same endpoints as the old panel. */
export function useAdminOverview(previewId: string | null, currency?: string) {
  const [ov, setOv] = useState<AdminOverview | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      const url = previewId ? `/api/owner/admins/${previewId}/preview` : "/api/admin/overview";
      setOv(await api<AdminOverview>(withCurrency(url, currency)));
      setErr("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not load admin panel.");
    }
  }, [previewId, currency]);
  useEffect(() => { void load(); }, [load]);
  return { ov, err, load };
}

/** Referrals data (codes + referred users) for the Referrals page. */
export function useAdminReferrals(previewId: string | null) {
  const [data, setData] = useState<ReferralsData | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      const url = previewId ? `/api/owner/admins/${previewId}/preview` : "/api/admin/referrals";
      const res = await api<ReferralsData>(url);
      setData(res);
      setErr("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not load referrals.");
    }
  }, [previewId]);
  useEffect(() => { void load(); }, [load]);
  return { data, err, load };
}

/** The referred-players list for the Players page. */
export function useAdminPlayers(previewId: string | null) {
  const [players, setPlayers] = useState<ReferralsData["referredUsers"] | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      const url = previewId ? `/api/owner/admins/${previewId}/preview` : "/api/admin/players";
      const res = await api<{ players: ReferralsData["referredUsers"]; referredUsers?: ReferralsData["referredUsers"] }>(url);
      setPlayers(res.players ?? res.referredUsers ?? []);
      setErr("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not load players.");
    }
  }, [previewId]);
  useEffect(() => { void load(); }, [load]);
  return { players, err, load };
}

/** Every commission day for the Commission page's History tab. */
export function useAdminHistory(previewId: string | null, currency?: string) {
  const [days, setDays] = useState<AdminOverview["history"] | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      const url = previewId ? `/api/owner/admins/${previewId}/preview` : "/api/admin/commission/history";
      const res = await api<{ days: AdminOverview["history"]; history?: AdminOverview["history"] }>(withCurrency(url, currency));
      setDays(res.days ?? res.history ?? []);
      setErr("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not load commission history.");
    }
  }, [previewId, currency]);
  useEffect(() => { void load(); }, [load]);
  return { days, err, load };
}

/** One day's deposits for the signed-in admin, or the previewed admin. */
export function useAdminDay(previewId: string | null, date: string, currency?: string) {
  const [day, setDay] = useState<DayDetail | null>(null);
  const loadDay = useCallback(async (d: string) => {
    try {
      const url = previewId ? `/api/owner/commission?adminId=${previewId}&date=${d}` : `/api/admin/commission?date=${d}`;
      setDay(await api<DayDetail>(withCurrency(url, currency)));
    } catch {
      setDay(null);
    }
  }, [previewId, currency]);
  useEffect(() => { if (date) void loadDay(date); }, [date, loadDay]);
  return { day, loadDay };
}

/** P0 Batch 4 (A1): the enhanced dashboard — "today so far", the last
 * 7 days of deposits, and the top 5 players by total deposited. */
export function useAdminDashboard(previewId: string | null, currency?: string) {
  const [dash, setDash] = useState<AdminDashboardData | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      const url = previewId ? `/api/owner/dashboard?adminId=${previewId}` : "/api/admin/dashboard";
      setDash(await api<AdminDashboardData>(withCurrency(url, currency)));
      setErr("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not load dashboard.");
    }
  }, [previewId, currency]);
  useEffect(() => { void load(); }, [load]);
  return { dash, err, load };
}

/** P0 Batch 4 (A9): the downline tree for the Referrals page. */
export function useAdminDownline(previewId: string | null) {
  const [tree, setTree] = useState<{ root: { id: string; name: string }; children: DownlineNode[] } | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      const url = previewId ? `/api/owner/referrals/tree?adminId=${previewId}` : "/api/admin/referrals/tree";
      setTree(await api<{ root: { id: string; name: string }; children: DownlineNode[] }>(url));
      setErr("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not load downline tree.");
    }
  }, [previewId]);
  useEffect(() => { void load(); }, [load]);
  return { tree, err, load };
}

export type PlayerSegmentKey = "new" | "active" | "dormant" | "high-roller" | "at-risk";

export interface PlayerSegmentRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  referralCodeUsed: string | null;
  // P1 Batch 4 (O24): the referring admin — a parent admin's list
  // shows which admin each player came through.
  referredByAdminName: string | null;
  createdAt: string;
  totalDeposited: number;
  lastPlayedAt: string | null;
  segments: PlayerSegmentKey[];
  tags: string[];
}

/** P1 Batch 1 (A14): the Players list with segment flags + counts. */
export function useAdminSegments(previewId: string | null) {
  const [data, setData] = useState<{ players: PlayerSegmentRow[]; counts: Record<PlayerSegmentKey, number>; total: number; scope: { childAdmins: { id: string; name: string }[] } } | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      const url = previewId ? `/api/admin/players/segments?adminId=${previewId}` : "/api/admin/players/segments";
      setData(await api<{ players: PlayerSegmentRow[]; counts: Record<PlayerSegmentKey, number>; total: number; scope: { childAdmins: { id: string; name: string }[] } }>(url));
      setErr("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not load players.");
    }
  }, [previewId]);
  useEffect(() => { void load(); }, [load]);
  return { data, err, load };
}

export interface PromoCodeRow {
  id: string;
  code: string;
  bonusAmount: number;
  bonusCurrency: string;
  maxUses: number;
  uses: number;
  usesLeft: number;
  expired: boolean;
  expiresAt: string | null;
  createdAt: string;
  redemptions: { userId: string; userName: string; userContact: string | null; redeemedAt: string }[];
}

/** P1 Batch 1 (A18): the admin's promo codes with uses left + redeemers. */
export function useAdminPromoCodes(previewId: string | null) {
  const [data, setData] = useState<{ codes: PromoCodeRow[] } | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      const url = previewId ? `/api/admin/promo-codes?adminId=${previewId}` : "/api/admin/promo-codes";
      setData(await api<{ codes: PromoCodeRow[] }>(url));
      setErr("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not load promo codes.");
    }
  }, [previewId]);
  useEffect(() => { void load(); }, [load]);
  return { data, err, load };
}

export interface KycRow {
  id: string;
  userId: string;
  userName: string;
  userContact: string | null;
  referringAdmin?: string | null;
  documentType: string;
  documentTypeLabel: string;
  documentUrl: string;
  status: string;
  // P1 Batch 4 (O22): true when the submission was auto-approved by
  // the URL-host allow-list rule (a host check, not a document check).
  autoApproved?: boolean;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  submittedAt: string;
}

/** P1 Batch 2 (A21): the KYC queue — the admin's own downline, or the
 *  previewed admin's queue when the owner previews. */
export function useAdminKyc(previewId: string | null, status: string) {
  const [data, setData] = useState<{ submissions: KycRow[]; counts: Record<string, number> } | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      const qs = `status=${encodeURIComponent(status)}`;
      const url = previewId ? `/api/owner/kyc?adminId=${previewId}&${qs}` : `/api/admin/kyc?${qs}`;
      setData(await api<{ submissions: KycRow[]; counts: Record<string, number> }>(url));
      setErr("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not load the KYC queue.");
    }
  }, [previewId, status]);
  useEffect(() => { void load(); }, [load]);
  return { data, err, load };
}

export interface FraudAlertRow {
  id: string;
  severity: "high" | "medium";
  signal: string;
  userId: string;
  userName: string;
  userContact: string | null;
  reason: string;
  createdAt: string;
}

/** P1 Batch 2 (A24): the fraud alerts — computed live, own downline
 *  (or the previewed admin's, for the owner). */
export function useAdminFraud(previewId: string | null) {
  const [data, setData] = useState<{ alerts: FraudAlertRow[]; counts: { high: number; medium: number } } | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      const url = previewId ? `/api/owner/fraud?adminId=${previewId}` : "/api/admin/fraud";
      setData(await api<{ alerts: FraudAlertRow[]; counts: { high: number; medium: number } }>(url));
      setErr("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not load fraud alerts.");
    }
  }, [previewId]);
  useEffect(() => { void load(); }, [load]);
  return { data, err, load };
}

export interface SentNotificationRow {
  id: string;
  userId: string;
  userName: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

/** P1 Batch 2 (A23): notifications this admin sent — the Overview
 *  broadcast section shows the recent ones (preview: the owner's
 *  endpoint for that admin). */
export function useAdminSentNotifications(previewId: string | null) {
  const [data, setData] = useState<{ sent: SentNotificationRow[] } | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      const url = previewId ? `/api/owner/notifications?adminId=${previewId}` : "/api/admin/notifications";
      setData(await api<{ sent: SentNotificationRow[] }>(url));
      setErr("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not load sent notifications.");
    }
  }, [previewId]);
  useEffect(() => { void load(); }, [load]);
  return { data, err, load };
}

// P2 Batch 1 (A25): CRM campaigns — the admin's drafts + sent
// campaigns (preview: the owner's endpoint for that admin).
export interface CampaignRow {
  id: string;
  name: string;
  message: string;
  audience: string;
  segment: string | null;
  targetPlayerIds: string[] | null;
  status: string;
  recipientCount: number;
  audienceLabel: string;
  sentAt: string | null;
  createdAt: string;
}

export function useAdminCampaigns(previewId: string | null) {
  const [data, setData] = useState<{ campaigns: CampaignRow[] } | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      const url = previewId ? `/api/owner/campaigns?adminId=${previewId}` : "/api/admin/campaigns";
      setData(await api<{ campaigns: CampaignRow[] }>(url));
      setErr("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not load campaigns.");
    }
  }, [previewId]);
  useEffect(() => { void load(); }, [load]);
  return { data, err, load };
}

// P2 Batch 1 (A26): VIP tiers + each downline player's tier.
export interface VipTierRow {
  id: string;
  name: string;
  minDeposited: number;
  perks: string[];
  sortOrder: number;
  createdAt: string;
}

export interface VipPlayerRow {
  id: string;
  name: string;
  contact: string | null;
  totalDeposited: number;
  tier: { id: string; name: string; minDeposited: number; perks: string[] } | null;
}

export function useAdminVipTiers(previewId: string | null) {
  const [data, setData] = useState<{ tiers: VipTierRow[]; players: VipPlayerRow[] } | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      const url = previewId ? `/api/admin/vip-tiers?adminId=${previewId}` : "/api/admin/vip-tiers";
      setData(await api<{ tiers: VipTierRow[]; players: VipPlayerRow[] }>(url));
      setErr("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not load VIP tiers.");
    }
  }, [previewId]);
  useEffect(() => { void load(); }, [load]);
  return { data, err, load };
}

// P2 Batch 1 (A27): tournaments — the admin's list, and one
// tournament with its leaderboard.
export interface TournamentRow {
  id: string;
  name: string;
  gameSlug: string;
  gameName: string;
  startAt: string;
  endAt: string;
  prizePool: number;
  status: string;
  winnerId: string | null;
  winnerName?: string | null;
  createdAt: string;
}

export interface LeaderboardRow {
  rank: number;
  userId: string;
  userName: string;
  userContact: string | null;
  points: number;
  // Phase 1 country-based (Nov 2026): the fiat this player's points
  // are in — points are that player's stakes, never a blended sum.
  fiatCurrency: string;
}

export function useAdminTournaments(previewId: string | null) {
  const [data, setData] = useState<{ tournaments: TournamentRow[] } | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      const url = previewId ? `/api/owner/tournaments?adminId=${previewId}` : "/api/admin/tournaments";
      setData(await api<{ tournaments: TournamentRow[] }>(url));
      setErr("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not load tournaments.");
    }
  }, [previewId]);
  useEffect(() => { void load(); }, [load]);
  return { data, err, load };
}

export function useAdminTournament(previewId: string | null, id: string | null) {
  const [data, setData] = useState<{ tournament: TournamentRow; leaderboard: LeaderboardRow[] } | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    if (!id) { setData(null); return; }
    try {
      const url = previewId ? `/api/owner/tournaments/${id}` : `/api/admin/tournaments/${id}`;
      setData(await api<{ tournament: TournamentRow; leaderboard: LeaderboardRow[] }>(url));
      setErr("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not load this tournament.");
    }
  }, [previewId, id]);
  useEffect(() => { void load(); }, [load]);
  return { data, err, load };
}

// P2 Batch 1 (A28): the live feed — the 20 most recent rounds from
// the admin's downline + the active-players count. The page polls
// this every 15 seconds; the hook is a plain load (the page re-arms).
export interface LiveFeedRow {
  id: string;
  userId: string;
  userName: string;
  game: string;
  gameName: string;
  currency: string;
  // Phase 1 country-based (Nov 2026): the fiat this round was played in.
  fiatCurrency: string;
  stake: number;
  payout: number;
  net: number;
  createdAt: string;
}

export function useAdminLiveFeed(previewId: string | null) {
  const [data, setData] = useState<{ feed: LiveFeedRow[]; activePlayers: number; fetchedAt: string } | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      const url = previewId ? `/api/owner/live-feed?adminId=${previewId}` : "/api/admin/live-feed";
      setData(await api<{ feed: LiveFeedRow[]; activePlayers: number; fetchedAt: string }>(url));
      setErr("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not load the live feed.");
    }
  }, [previewId]);
  useEffect(() => { void load(); }, [load]);
  return { data, err, load };
}

// P2 Batch 1 (A29): the responsible-gambling list — players with an
// active cool-off or self-exclusion, with their until dates.
export interface ResponsibleRow {
  id: string;
  name: string;
  contact: string | null;
  coolOffUntil: string | null;
  selfExcludedUntil: string | null;
  selfExclusionReason: string | null;
}

export function useAdminResponsible(previewId: string | null) {
  const [data, setData] = useState<{ players: ResponsibleRow[] } | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      const url = previewId ? `/api/admin/players/responsible?adminId=${previewId}` : "/api/admin/players/responsible";
      setData(await api<{ players: ResponsibleRow[] }>(url));
      setErr("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not load responsible-gambling players.");
    }
  }, [previewId]);
  useEffect(() => { void load(); }, [load]);
  return { data, err, load };
}

// P2 Batch 1 (A29): the signed-in player's own limits — the account
// page (self-exclusion banner + Take a break) and the game room
// (reality check) read this.
export interface PlayerLimits {
  maxStake: number | null;
  maxDepositPerDay: number | null;
  maxLossPerDay: number | null;
  coolOffUntil: string | null;
  selfExcludedUntil: string | null;
  selfExclusionReason: string | null;
  realityCheckMinutes: number;
}

export function usePlayerLimits() {
  const [limits, setLimits] = useState<PlayerLimits | null>(null);
  const load = useCallback(async () => {
    try {
      const data = await api<{ limits: PlayerLimits }>("/api/player/limits");
      setLimits(data.limits);
    } catch {
      setLimits(null);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return { limits, load };
}
