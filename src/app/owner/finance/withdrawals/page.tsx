// Owner Withdrawals (Phase 2) — split out of the old one-page owner panel
// (src/app/owner/legacy/page.tsx). Same sections, same endpoints, same
// behaviour — now its own route, loading only its own data.
"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtMoney } from "../../../../lib/api";
import { useStore } from "../../../../lib/store";
import { useOwner } from "../../../../components/owner/OwnerContext";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";

export default function OwnerWithdrawalsPage() {
  const { user, toast } = useStore();
  const { fiat } = useOwner();
  // P0 Batch 1 (O8): withdrawal oversight — every pending withdrawal
  // platform-wide. Large ones an admin approved sit as "admin_approved"
  // until the owner approves them second (maker-checker, GH₵ 500).
  interface OwnerWdRow { id: string; userId: string; userName: string; userContact: string | null; adminId: string | null; adminName: string | null; amount: number; method: string; fiatCurrency: string; status: string; reason: string | null; createdAt: string; decidedAt: string | null }
  const [ownerWd, setOwnerWd] = useState<OwnerWdRow[] | null>(null);
  const [ownerWdPending, setOwnerWdPending] = useState(0);
  // A failed withdrawals call must say so: the catch below used to
  // set [] — a 500 then looked exactly like "no withdrawals".
  const [ownerWdErr, setOwnerWdErr] = useState(false);
  const [ownerWdStatus, setOwnerWdStatus] = useState("");
  const [ownerRejectId, setOwnerRejectId] = useState<string | null>(null);
  const [ownerRejectReason, setOwnerRejectReason] = useState("");
  const [ownerWdBusy, setOwnerWdBusy] = useState<string | null>(null);
  const loadOwnerWd = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (ownerWdStatus) p.set("status", ownerWdStatus);
      p.set("currency", fiat);
      const qs = p.toString();
      const r = await api<{ withdrawals: OwnerWdRow[]; pending: number }>(`/api/owner/withdrawals${qs ? `?${qs}` : ""}`);
      setOwnerWd(r.withdrawals);
      setOwnerWdPending(r.pending);
      setOwnerWdErr(false);
    } catch { setOwnerWd([]); setOwnerWdErr(true); }
  }, [ownerWdStatus, fiat]);
  useEffect(() => { if (user) void loadOwnerWd(); }, [loadOwnerWd, user]);
  const decideOwnerWd = async (w: OwnerWdRow, decision: "approve" | "reject") => {
    if (decision === "reject" && ownerRejectId !== w.id) { setOwnerRejectId(w.id); setOwnerRejectReason(""); return; }
    if (decision === "reject" && ownerRejectReason.trim().length < 3) { toast("A reason is required to reject", "lose"); return; }
    setOwnerWdBusy(w.id);
    try {
      await api(`/api/owner/withdrawals/${w.id}/decide`, {
        method: "POST",
        body: JSON.stringify({ decision, ...(decision === "reject" ? { reason: ownerRejectReason.trim() } : {}) }),
      });
      toast(decision === "approve" ? "Withdrawal approved" : "Withdrawal rejected", decision === "approve" ? "win" : "lose");
      setOwnerRejectId(null);
      setOwnerRejectReason("");
      await loadOwnerWd();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Decision failed", "lose");
    } finally { setOwnerWdBusy(null); }
  };
  return (
    <div>
      <PageHeader title="Withdrawals" sub="Every withdrawal request, platform-wide." />
      <OwnerRangeBar />
      <section className="admin-sec" id="ow-sec-withdrawals">
      <h3>Withdrawals{ownerWdPending > 0 ? ` (${ownerWdPending} pending)` : ""}</h3>
      <div className="money-chips" role="group" aria-label="Filter by status">
        <button type="button" className={!ownerWdStatus ? "on" : ""} onClick={() => setOwnerWdStatus("")}>All</button>
        {["pending", "held", "admin_approved", "approved", "rejected"].map((s) => (
          <button key={s} type="button" className={ownerWdStatus === s ? "on" : ""} onClick={() => setOwnerWdStatus(s)}>{s === "admin_approved" ? "Awaiting owner" : s[0].toUpperCase() + s.slice(1)}</button>
        ))}
      </div>
      {ownerWd === null ? <p>Loading withdrawals…</p> : ownerWdErr ? <p className="rg48-err">Could not load withdrawals.</p> : ownerWd.length === 0 ? (
        <p>No withdrawal requests.</p>
      ) : (
        <div className="wd-list">
          {ownerWd.map((w) => (
            <div key={w.id} className="wd-row">
              <div className="wd-main">
                <b>{w.userName}</b><span>{w.userContact || ""}</span>
                <span className="wd-amt">{fmtMoney(w.amount, w.fiatCurrency ?? fiat)} · {w.method}</span>
                <span className="wd-date">{w.adminName ? `via ${w.adminName} · ` : ""}{new Date(w.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <span className={`wd-status wd-${w.status}`}>{w.status === "admin_approved" ? "Awaiting owner" : w.status}</span>
              {w.reason ? <p className="wd-reason">Reason: {w.reason}</p> : null}
              {(w.status === "pending" || w.status === "admin_approved" || w.status === "held") && (
                <div className="wd-actions">
                  {w.status === "admin_approved" ? <span className="wd-note">Admin approved — your approval makes it final.</span> : null}
                  {w.status === "held" ? <span className="wd-note">Held by a risk rule — review before deciding.</span> : null}
                  <button className="btn btn-gold btn-sm" type="button" disabled={ownerWdBusy === w.id} onClick={() => void decideOwnerWd(w, "approve")}>Approve</button>
                  <button className="btn btn-ghost btn-sm" type="button" disabled={ownerWdBusy === w.id} onClick={() => void decideOwnerWd(w, "reject")}>Reject</button>
                </div>
              )}
              {ownerRejectId === w.id && (
                <div className="wd-reject">
                  <input type="text" placeholder="Reason for rejection (required)" value={ownerRejectReason} onChange={(e) => setOwnerRejectReason(e.target.value)} aria-label="Rejection reason" />
                  <button className="btn btn-gold btn-sm" type="button" disabled={ownerWdBusy === w.id} onClick={() => void decideOwnerWd(w, "reject")}>Confirm reject</button>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setOwnerRejectId(null); setOwnerRejectReason(""); }}>Cancel</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      </section>
    </div>
  );
}
