// Owner Ledger (Phase 2) — split out of the old one-page owner panel
// (src/app/owner/legacy/page.tsx). Same sections, same endpoints, same
// behaviour — now its own route, loading only its own data.
"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtMoney } from "../../../../lib/api";
import { todayStr } from "../../../../lib/admin-client";
import { useStore } from "../../../../lib/store";
import { useOwner } from "../../../../components/owner/OwnerContext";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";

export default function OwnerLedgerPage() {
  const { user } = useStore();
  const { fiat } = useOwner();
  const { admins: ctxAdmins, loadAdmins } = useOwner();
  const admins = ctxAdmins ?? [];
  useEffect(() => { if (user) void loadAdmins(); }, [loadAdmins, user]);

  // P0 Batch 1 (O7): global transaction ledger — every money movement,
  // platform-wide, searchable by type, period, amount, method and admin.
  interface OwnerLedgerRow { id: string; type: string; userId: string; userName: string; userContact: string | null; adminId: string | null; adminName: string | null; amount: number; wallet: string; fiatCurrency: string; detail: string; status?: string; reason?: string; createdAt: string }
  const [ownerLedger, setOwnerLedger] = useState<OwnerLedgerRow[] | null>(null);
  const [ownerLedTotals, setOwnerLedTotals] = useState<{ rows: number; cashIn: number; cashOut: number } | null>(null);
  // A failed ledger call must say so: the catch below used to set [] —
  // a 500 then looked exactly like "no money movements".
  const [ownerLedErr, setOwnerLedErr] = useState(false);
  const [ownerLedType, setOwnerLedType] = useState("");
  const [ownerLedQ, setOwnerLedQ] = useState("");
  const [ownerLedFrom, setOwnerLedFrom] = useState("");
  const [ownerLedTo, setOwnerLedTo] = useState("");
  const [ownerLedAdmin, setOwnerLedAdmin] = useState("");
  const loadOwnerLedger = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (ownerLedType) p.set("type", ownerLedType);
      if (ownerLedQ.trim()) p.set("q", ownerLedQ.trim());
      if (ownerLedFrom) p.set("from", ownerLedFrom);
      if (ownerLedTo) p.set("to", ownerLedTo);
      if (ownerLedAdmin) p.set("adminId", ownerLedAdmin);
      p.set("currency", fiat);
      const qs = p.toString();
      const r = await api<{ rows: OwnerLedgerRow[]; totals: { rows: number; cashIn: number; cashOut: number } }>(`/api/owner/ledger${qs ? `?${qs}` : ""}`);
      setOwnerLedger(r.rows);
      setOwnerLedTotals(r.totals);
      setOwnerLedErr(false);
    } catch { setOwnerLedger([]); setOwnerLedErr(true); }
  }, [ownerLedType, ownerLedQ, ownerLedFrom, ownerLedTo, ownerLedAdmin, fiat]);
  useEffect(() => { if (user) void loadOwnerLedger(); }, [loadOwnerLedger, user]);
  return (
    <div>
      <PageHeader title="Ledger" sub="Every money movement, platform-wide." />
      <OwnerRangeBar />
      <section className="admin-sec" id="ow-sec-ledger">
      <h3>Ledger</h3>
      <div className="money-filters">
        <label className="players-search">
          <input type="search" placeholder="Search by player or contact" value={ownerLedQ} onChange={(e) => setOwnerLedQ(e.target.value)} aria-label="Search ledger" />
        </label>
        <div className="money-chips" role="group" aria-label="Filter by type">
          <button type="button" className={!ownerLedType ? "on" : ""} onClick={() => setOwnerLedType("")}>All types</button>
          {["deposit", "bet", "withdrawal", "adjustment", "conversion", "payout"].map((t) => (
            <button key={t} type="button" className={ownerLedType === t ? "on" : ""} onClick={() => setOwnerLedType(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
          ))}
        </div>
        <div className="money-dates ow-dates">
          <label>From <input type="date" value={ownerLedFrom} max={todayStr()} onChange={(e) => setOwnerLedFrom(e.target.value)} /></label>
          <label>To <input type="date" value={ownerLedTo} max={todayStr()} onChange={(e) => setOwnerLedTo(e.target.value)} /></label>
          <label>Admin
            <select value={ownerLedAdmin} onChange={(e) => setOwnerLedAdmin(e.target.value)} aria-label="Filter by admin">
              <option value="">All admins</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {ownerLedTotals && (
        <div className="sum-cards ow-sum">
          <div className="sum-card"><span>Rows</span><b>{ownerLedTotals.rows}</b></div>
          <div className="sum-card"><span>Cash in</span><b>{fmtMoney(ownerLedTotals.cashIn, fiat)}</b></div>
          <div className="sum-card"><span>Cash out</span><b>{fmtMoney(ownerLedTotals.cashOut, fiat)}</b></div>
        </div>
      )}
      {ownerLedger === null ? <p>Loading ledger…</p> : ownerLedErr ? <p className="rg48-err">Could not load ledger.</p> : ownerLedger.length === 0 ? (
        <p>No money movements yet.</p>
      ) : (
        <div className="ledger-list">
          {ownerLedger.map((r) => {
            const sign = r.amount > 0 ? "+" : r.amount < 0 ? "−" : "";
            const abs = Math.abs(r.amount);
            const amt = r.wallet === "coins" ? `${sign}${Math.round(abs)} coins` : `${sign}${fmtMoney(abs, r.fiatCurrency ?? fiat)}`;
            return (
              <div key={r.id} className="ledger-row">
                <span className="ledger-txt">
                  <b>{r.userName} <span className={`ledger-type ledger-${r.type}`}>{r.type}</span></b>
                  <span>{r.detail}{r.reason ? ` — ${r.reason}` : ""}{r.status ? ` · ${r.status}` : ""}{r.adminName ? ` · ${r.adminName}` : ""}</span>
                  <span>{new Date(r.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </span>
                <b className={r.amount >= 0 ? "ledger-in" : "ledger-out"}>{amt}</b>
              </div>
            );
          })}
        </div>
      )}
      </section>
    </div>
  );
}
