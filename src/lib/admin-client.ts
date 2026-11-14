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
  referredUsers: { id: string; name: string; email: string | null; phone: string | null; referralCodeUsed: string | null; createdAt: string }[];
  coinsGiven: number;
  redemptions: number;
  commission: { today: number; yesterday: number; last7d: number; last30d: number; allTime: number };
  history: { date: string; deposits: number; totalAmount: number; totalCommission: number; totalStakes?: number; totalPayouts?: number; model?: string; rate?: number }[];
}

export interface DayDetail {
  date: string;
  deposits: { id: string; userId: string; userName: string; userContact: string; amount: number; method: string; pctInForce: number; commission: number; time: string }[];
  totals: { deposits: number; totalAmount: number; totalCommission: number; totalStakes?: number; totalPayouts?: number; model?: string; rate?: number };
}

export interface UserDetail {
  user: { id: string; name: string; email: string | null; phone: string | null; role: string; cash: number; coins: number; joinedAt: string; referralCodeUsed: string | null; referringAdmin: { id: string; name: string; email: string } | null; blockedAt: string | null; blockedReason: string | null };
  deposits: { id: string; amount: number; method: string; pctInForce: number; commission: number; createdAt: string }[];
  totals: { deposits: number; totalDeposited: number; totalCommission: number; coinsGiven: number };
  // P0 Batch 4 (A3): bet/round history, KYC status, commission earned,
  // and support tickets.
  rounds: { id: string; game: string; gameName: string; currency: string; stake: number; payout: number; net: number; createdAt: string }[];
  // P1 Batch 2 (A21): the real KYC status — the latest submission, with
  // its document type, submitted date and rejection reason.
  kycStatus: "not_submitted" | "pending" | "approved" | "rejected";
  kycDocumentType: string | null;
  kycDocumentUrl: string | null;
  kycSubmittedAt: string | null;
  kycRejectionReason: string | null;
  commission: { total: number; model: string; rate: number };
  tickets: { id: string; subject: string; status: string; createdAt: string }[];
  // P1 Batch 1 (A19/A20): admin-only notes + tags, and per-player limits.
  notes: { id: string; text: string; authorId: string; authorName: string; createdAt: string }[];
  tags: string[];
  limits: { maxStake: number | null; maxDepositPerDay: number | null; maxLossPerDay: number | null; coolOffUntil: string | null } | null;
}

export interface AdminDashboardData {
  today: { deposits: number; depositsTotal: number; newPlayers: number; activePlayers: number; commission: number };
  week: { date: string; deposits: number; total: number }[];
  topPlayers: { id: string; name: string; contact: string | null; deposits: number; totalDeposited: number }[];
}

export interface DownlineNode {
  id: string;
  name: string;
  contact: string | null;
  role: string;
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

/** Overview for the signed-in admin, or for the admin the owner is
 *  previewing (?preview=<adminId>). Same endpoints as the old panel. */
export function useAdminOverview(previewId: string | null) {
  const [ov, setOv] = useState<AdminOverview | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      const url = previewId ? `/api/owner/admins/${previewId}/preview` : "/api/admin/overview";
      setOv(await api<AdminOverview>(url));
      setErr("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not load admin panel.");
    }
  }, [previewId]);
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
export function useAdminHistory(previewId: string | null) {
  const [days, setDays] = useState<AdminOverview["history"] | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      const url = previewId ? `/api/owner/admins/${previewId}/preview` : "/api/admin/commission/history";
      const res = await api<{ days: AdminOverview["history"]; history?: AdminOverview["history"] }>(url);
      setDays(res.days ?? res.history ?? []);
      setErr("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not load commission history.");
    }
  }, [previewId]);
  useEffect(() => { void load(); }, [load]);
  return { days, err, load };
}

/** One day's deposits for the signed-in admin, or the previewed admin. */
export function useAdminDay(previewId: string | null, date: string) {
  const [day, setDay] = useState<DayDetail | null>(null);
  const loadDay = useCallback(async (d: string) => {
    try {
      const url = previewId ? `/api/owner/commission?adminId=${previewId}&date=${d}` : `/api/admin/commission?date=${d}`;
      setDay(await api<DayDetail>(url));
    } catch {
      setDay(null);
    }
  }, [previewId]);
  useEffect(() => { if (date) void loadDay(date); }, [date, loadDay]);
  return { day, loadDay };
}

/** P0 Batch 4 (A1): the enhanced dashboard — "today so far", the last
 * 7 days of deposits, and the top 5 players by total deposited. */
export function useAdminDashboard(previewId: string | null) {
  const [dash, setDash] = useState<AdminDashboardData | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      const url = previewId ? `/api/owner/dashboard?adminId=${previewId}` : "/api/admin/dashboard";
      setDash(await api<AdminDashboardData>(url));
      setErr("");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Could not load dashboard.");
    }
  }, [previewId]);
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
  createdAt: string;
  totalDeposited: number;
  lastPlayedAt: string | null;
  segments: PlayerSegmentKey[];
  tags: string[];
}

/** P1 Batch 1 (A14): the Players list with segment flags + counts. */
export function useAdminSegments(previewId: string | null) {
  const [data, setData] = useState<{ players: PlayerSegmentRow[]; counts: Record<PlayerSegmentKey, number>; total: number } | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try {
      const url = previewId ? `/api/admin/players/segments?adminId=${previewId}` : "/api/admin/players/segments";
      setData(await api<{ players: PlayerSegmentRow[]; counts: Record<PlayerSegmentKey, number>; total: number }>(url));
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
