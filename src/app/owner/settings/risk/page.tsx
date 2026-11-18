// Owner Risk rules (Phase 2) — split out of the old one-page owner panel
// (src/app/owner/legacy/page.tsx). Same sections, same endpoints, same
// behaviour — now its own route, loading only its own data.
"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../lib/api";
import { useStore } from "../../../../lib/store";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";

export default function OwnerRiskRulesPage() {
  const { user, toast } = useStore();
  // O31: automated risk rules — a fraud signal + threshold + action.
  // "block_player" and "hold_withdrawal" are REAL actions; "flag" only
  // adds the alert to the fraud console.
  interface RiskRuleRow { id: string; name: string; signal: string; threshold: number; action: string; active: boolean; createdBy: string; createdAt: string }
  interface RiskSignalRow { key: string; label: string; thresholdLabel: string; thresholdHint: string; defaultThreshold: number }
  interface RiskActionRow { key: string; label: string; note: string }
  const [riskRules, setRiskRules] = useState<RiskRuleRow[] | null>(null);
  const [riskSignals, setRiskSignals] = useState<RiskSignalRow[]>([]);
  const [riskActions, setRiskActions] = useState<RiskActionRow[]>([]);
  const [rrName, setRrName] = useState("");
  const [rrSignal, setRrSignal] = useState("withdrawal-flags");
  const [rrThreshold, setRrThreshold] = useState("2");
  const [rrAction, setRrAction] = useState("flag");
  const [rrBusy, setRrBusy] = useState(false);
  const [rrToggleBusy, setRrToggleBusy] = useState<string | null>(null);
  const loadRiskRules = useCallback(async () => {
    try {
      const r = await api<{ rules: RiskRuleRow[]; signals: RiskSignalRow[]; actions: RiskActionRow[] }>("/api/owner/risk-rules");
      setRiskRules(r.rules);
      setRiskSignals(r.signals);
      setRiskActions(r.actions);
    } catch { setRiskRules([]); }
  }, []);
  useEffect(() => { if (user) void loadRiskRules(); }, [loadRiskRules, user]);
  const createRiskRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setRrBusy(true);
    try {
      await api("/api/owner/risk-rules", { method: "POST", body: JSON.stringify({ name: rrName.trim(), signal: rrSignal, threshold: Number(rrThreshold), action: rrAction }) });
      toast(`Risk rule “${rrName.trim()}” created`, "win");
      setRrName("");
      await loadRiskRules();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Risk rule failed", "lose");
    } finally { setRrBusy(false); }
  };
  const toggleRiskRule = async (r: RiskRuleRow) => {
    setRrToggleBusy(r.id);
    try {
      await api(`/api/owner/risk-rules/${r.id}/toggle`, { method: "POST" });
      toast(`Risk rule “${r.name}” ${r.active ? "disabled" : "enabled"}`, "win");
      await loadRiskRules();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not toggle the rule", "lose");
    } finally { setRrToggleBusy(null); }
  };
  return (
    <div>
      <PageHeader title="Risk rules" sub="Fraud signals, thresholds, actions." />
      <OwnerRangeBar />
      <section className="admin-sec">
      <h3>Risk rules</h3>
      <form className="owner-add" onSubmit={createRiskRule}>
        <div className="pd-adjust-row">
          <label>Name
            <input type="text" value={rrName} onChange={(e) => setRrName(e.target.value)} maxLength={60} aria-label="Risk rule name" placeholder="e.g. Hold fast withdrawals" />
          </label>
          <label>Signal
            <select value={rrSignal} onChange={(e) => { setRrSignal(e.target.value); const s = riskSignals.find((x) => x.key === e.target.value); if (s) setRrThreshold(String(s.defaultThreshold)); }} aria-label="Risk rule signal">
              {riskSignals.map((s) => (<option key={s.key} value={s.key}>{s.label}</option>))}
            </select>
          </label>
          <label>{riskSignals.find((s) => s.key === rrSignal)?.thresholdLabel ?? "Threshold"}
            <input type="number" min={0.01} step="0.01" inputMode="decimal" value={rrThreshold} onChange={(e) => setRrThreshold(e.target.value)} aria-label="Risk rule threshold" />
          </label>
          <label>Action
            <select value={rrAction} onChange={(e) => setRrAction(e.target.value)} aria-label="Risk rule action">
              {riskActions.map((a) => (<option key={a.key} value={a.key}>{a.label}</option>))}
            </select>
          </label>
          <button className="btn btn-gold" type="submit" disabled={rrBusy}>{rrBusy ? "Creating…" : "Create rule"}</button>
        </div>
      </form>
      {riskRules === null ? <p>Loading rules…</p> : riskRules.length === 0 ? (
        <p>No risk rules yet — the fraud console still flags, but nothing is blocked or held automatically.</p>
      ) : (
        <div className="rg48-twrap">
          <table className="dep-table">
            <thead><tr><th>Rule</th><th>Signal</th><th>Threshold</th><th>Action</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {riskRules.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{riskSignals.find((s) => s.key === r.signal)?.label ?? r.signal}</td>
                  <td>{r.threshold}</td>
                  <td>{riskActions.find((a) => a.key === r.action)?.label ?? r.action}</td>
                  <td>{r.active ? "Active" : "Disabled"}</td>
                  <td><button className="btn btn-ghost btn-sm" type="button" disabled={rrToggleBusy === r.id} onClick={() => void toggleRiskRule(r)}>{rrToggleBusy === r.id ? "…" : r.active ? "Disable" : "Enable"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </section>
    </div>
  );
}
