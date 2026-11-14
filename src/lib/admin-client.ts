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
