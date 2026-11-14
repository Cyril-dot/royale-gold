// Shared CLIENT admin-dashboard data (round 11): the admin panel is split
// into real routes (/admin, /admin/referrals, /admin/commission,
// /admin/players/[id]) — each page fetches what it needs from the same
// endpoints the old single-page AdminPanel used. No API route changed.
// (src/lib/admin.ts is the SERVER overview helper — different file.)

"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

export interface AdminOverview {
  admin: { id: string; name: string; email: string; commissionPct: number; active: boolean };
  codes: { id: string; code: string; active: boolean; createdAt: string }[];
  referredUsers: { id: string; name: string; email: string | null; phone: string | null; referralCodeUsed: string | null; createdAt: string }[];
  coinsGiven: number;
  redemptions: number;
  commission: { today: number; yesterday: number; last7d: number; last30d: number; allTime: number };
  history: { date: string; deposits: number; totalAmount: number; totalCommission: number }[];
}

export interface DayDetail {
  date: string;
  deposits: { id: string; userId: string; userName: string; userContact: string; amount: number; method: string; pctInForce: number; commission: number; time: string }[];
  totals: { deposits: number; totalAmount: number; totalCommission: number };
}

export interface UserDetail {
  user: { id: string; name: string; email: string | null; phone: string | null; role: string; cash: number; coins: number; joinedAt: string; referralCodeUsed: string | null; referringAdmin: { id: string; name: string; email: string } | null; blockedAt: string | null; blockedReason: string | null };
  deposits: { id: string; amount: number; method: string; pctInForce: number; commission: number; createdAt: string }[];
  totals: { deposits: number; totalDeposited: number; totalCommission: number; coinsGiven: number };
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
