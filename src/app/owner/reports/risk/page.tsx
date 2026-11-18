// Owner Risk (Phase 2) — split out of the old one-page owner panel
// (src/app/owner/legacy/page.tsx). Same sections, same endpoints, same
// behaviour — now its own route, loading only its own data.
"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../lib/api";
import Link from "next/link";
import { useStore } from "../../../../lib/store";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";

export default function OwnerRiskPage() {
  const { user } = useStore();
  // P1 Batch 3 (O18): the global fraud console — same signals as the
  // admin fraud pages, over every player, with per-admin rollups.
  interface OwnerFraudAlert { id: string; severity: string; signal: string; userId: string; userName: string; userContact: string | null; reason: string; createdAt: string }
  interface OwnerFraudRollup { adminId: string | null; adminName: string; high: number; medium: number; total: number }
  const [ownerFraud, setOwnerFraud] = useState<{ alerts: OwnerFraudAlert[]; counts: { high: number; medium: number }; byAdmin: OwnerFraudRollup[] } | null>(null);
  // A failed fraud call must say so, never hang on "Loading…" forever.
  const [ownerFraudErr, setOwnerFraudErr] = useState(false);
  const loadOwnerFraud = useCallback(async () => {
    try {
      setOwnerFraud(await api<{ alerts: OwnerFraudAlert[]; counts: { high: number; medium: number }; byAdmin: OwnerFraudRollup[] }>("/api/owner/fraud"));
      setOwnerFraudErr(false);
    } catch { setOwnerFraud(null); setOwnerFraudErr(true); }
  }, []);
  useEffect(() => { if (user) void loadOwnerFraud(); }, [loadOwnerFraud, user]);

  // O32: anomaly alerts — rule-based, computed live from the real
  // tables. No stored rows, no ML model, no AI — just thresholds.
  interface AnomalyRow { id: string; type: string; severity: string; userId: string | null; userName: string | null; game: string | null; gameName: string | null; reason: string; createdAt: string }
  const [anomalies, setAnomalies] = useState<{ anomalies: AnomalyRow[]; counts: { high: number; medium: number } } | null>(null);
  // A failed anomalies call must say so, never hang on "Loading…" forever.
  const [anomaliesErr, setAnomaliesErr] = useState(false);
  const loadAnomalies = useCallback(async () => {
    try { setAnomalies(await api<{ anomalies: AnomalyRow[]; counts: { high: number; medium: number } }>("/api/owner/anomalies")); setAnomaliesErr(false); } catch { setAnomalies(null); setAnomaliesErr(true); }
  }, []);
  useEffect(() => { if (user) void loadAnomalies(); }, [loadAnomalies, user]);

  // P1 Batch 3 (O18): the same signal labels as the admin fraud page.
  const FRAUD_SIGNAL_LABELS: Record<string, string> = {
    "withdrawal-flags": "Flagged withdrawal",
    "rapid-withdrawals": "Rapid withdrawals",
    "deposit-no-play": "Deposit, no play",
    "deposit-then-withdraw": "Deposit then withdraw",
  };
  return (
    <div>
      <PageHeader title="Risk" sub="Fraud console and anomaly alerts." />
      <OwnerRangeBar />
      <section className="admin-sec">
      <h3>Fraud console</h3>
      {ownerFraud === null ? (ownerFraudErr ? <p className="rg48-err">Could not load fraud console.</p> : <p>Loading fraud console…</p>) : (
        <>
          <div className="sum-cards">
            <div className="sum-card"><span>High</span><b>{ownerFraud.counts.high}</b></div>
            <div className="sum-card"><span>Medium</span><b>{ownerFraud.counts.medium}</b></div>
            <div className="sum-card"><span>Total</span><b>{ownerFraud.alerts.length}</b></div>
          </div>
          <button className="btn btn-ghost" type="button" onClick={() => void loadOwnerFraud()}>Refresh alerts</button>
          <h4>By admin</h4>
          <div className="rg48-twrap">
            <table className="dep-table">
              <thead><tr><th>Admin</th><th>High</th><th>Medium</th><th>Total</th></tr></thead>
              <tbody>
                {ownerFraud.byAdmin.map((r) => (
                  <tr key={r.adminId ?? "none"}><td>{r.adminName}</td><td>{r.high}</td><td>{r.medium}</td><td>{r.total}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {ownerFraud.alerts.length === 0 ? <p>No fraud signals platform-wide right now.</p> : (
            <div className="fraud-list">
              {ownerFraud.alerts.map((a) => (
                <article key={a.id} className="fraud-row">
                  <div className="fraud-head">
                    <span className={`sev-pill sev-${a.severity}`}>{a.severity === "high" ? "HIGH" : "MEDIUM"}</span>
                    <b>{FRAUD_SIGNAL_LABELS[a.signal] ?? a.signal}</b>
                  </div>
                  <p>{a.reason}</p>
                  <p className="rg48-sub">
                    <Link href={`/admin/players/${a.userId}`}>{a.userName}</Link>
                    {a.userContact ? ` · ${a.userContact}` : ""} · {new Date(a.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </article>
              ))}
            </div>
          )}
        </>
      )}
      </section>

      <section className="admin-sec">
      <h3>Anomaly alerts</h3>
      {anomalies === null ? (anomaliesErr ? <p className="rg48-err">Could not load anomaly alerts.</p> : <p>Loading anomalies…</p>) : (
        <>
          <div className="sum-cards">
            <div className="sum-card"><span>High</span><b>{anomalies.counts.high}</b></div>
            <div className="sum-card"><span>Medium</span><b>{anomalies.counts.medium}</b></div>
          </div>
          {anomalies.anomalies.length === 0 ? <p>No anomalies right now.</p> : (
            <div className="fraud-list">
              {anomalies.anomalies.map((a) => (
                <article key={a.id} className="fraud-row">
                  <div className="fraud-head">
                    <span className={`sev-pill sev-${a.severity}`}>{a.severity === "high" ? "HIGH" : "MEDIUM"}</span>
                    <b>{a.type === "win-rate" ? "Win rate" : a.type === "stake-jump" ? "Stake jump" : a.type === "rtp-spike" ? "RTP spike" : "Deposit then withdraw"}</b>
                  </div>
                  <p>{a.reason}</p>
                  <p className="rg48-sub">
                    {a.userId ? <Link href={`/admin/players/${a.userId}`}>{a.userName}</Link> : a.gameName ?? a.game}
                    {a.userId ? "" : " · see the RTP monitor above"} · {new Date(a.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </article>
              ))}
            </div>
          )}
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => void loadAnomalies()}>Refresh anomalies</button>
        </>
      )}
      </section>
    </div>
  );
}
