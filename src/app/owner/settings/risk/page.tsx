// Owner Risk rules (Phase 4 restyle) — split out of the old one-page owner
// panel (deleted in Phase 4). Same endpoints, same behaviour,
// staff-ui throughout. Every rule toggle goes through ConfirmDialog
// with the rule's effect shown: "block_player" and "hold_withdrawal"
// are REAL actions; "flag" only adds the alert to the fraud console.
"use client";

import { useMemo, useState, type ReactNode } from "react";
import { api } from "../../../../lib/api";
import { useStore } from "../../../../lib/store";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { Card } from "../../../../components/staff-ui/Card";
import { Button } from "../../../../components/staff-ui/Button";
import { FormField, Input, Select } from "../../../../components/staff-ui/Form";
import { Badge } from "../../../../components/staff-ui/Badge";
import { ConfirmDialog } from "../../../../components/staff-ui/Dialog";
import { DataTable, type DataColumn } from "../../../../components/staff-ui/DataTable";
import { Skeleton, ErrorState } from "../../../../components/staff-ui/Feedback";
import { useOwnerFetch } from "../../../../components/owner/useOwnerFetch";

// O31: automated risk rules — a fraud signal + threshold + action.
interface RiskRuleRow {
  id: string;
  name: string;
  signal: string;
  threshold: number;
  action: string;
  active: boolean;
  createdBy: string;
  createdAt: string;
}
interface RiskSignalRow {
  key: string;
  label: string;
  thresholdLabel: string;
  thresholdHint: string;
  defaultThreshold: number;
}
interface RiskActionRow {
  key: string;
  label: string;
  note: string;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** The create-rule form. Rendered only once the signals + actions
 *  have loaded (the selects need them); remounted via key when the
 *  loaded lists change. */
function RiskRuleForm({
  signals,
  actions,
  onSaved,
}: {
  signals: RiskSignalRow[];
  actions: RiskActionRow[];
  onSaved: () => void;
}) {
  const { toast } = useStore();
  const [name, setName] = useState("");
  const [signal, setSignal] = useState(signals[0]?.key ?? "withdrawal-flags");
  const [threshold, setThreshold] = useState(String(signals[0]?.defaultThreshold ?? 2));
  const [action, setAction] = useState(actions[0]?.key ?? "flag");
  const [busy, setBusy] = useState(false);
  const signalRow = signals.find((s) => s.key === signal);
  const actionRow = actions.find((a) => a.key === action);
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/owner/risk-rules", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), signal, threshold: Number(threshold), action }),
      });
      toast(`Risk rule “${name.trim()}” created`, "win");
      setName("");
      onSaved();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Risk rule failed", "lose");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={create}>
      <FormField label="Name" required>
        <Input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          aria-label="Risk rule name"
          placeholder="e.g. Hold fast withdrawals"
          required
        />
      </FormField>
      <FormField label="Signal" hint={signalRow?.thresholdHint}>
        <Select
          value={signal}
          onChange={(e) => {
            setSignal(e.target.value);
            const s = signals.find((x) => x.key === e.target.value);
            if (s) setThreshold(String(s.defaultThreshold));
          }}
          aria-label="Risk rule signal"
        >
          {signals.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label={signalRow?.thresholdLabel ?? "Threshold"}>
        <Input
          type="number"
          min={0.01}
          step={0.01}
          inputMode="decimal"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          aria-label="Risk rule threshold"
        />
      </FormField>
      <FormField label="Action" hint={actionRow?.note}>
        <Select value={action} onChange={(e) => setAction(e.target.value)} aria-label="Risk rule action">
          {actions.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label}
            </option>
          ))}
        </Select>
      </FormField>
      <Button variant="primary" type="submit" loading={busy}>
        Create rule
      </Button>
    </form>
  );
}

export default function OwnerRiskRulesPage() {
  const { user, toast } = useStore();
  const url = useMemo(() => (user ? "/api/owner/risk-rules" : null), [user]);
  const { data, err, loading, reload } = useOwnerFetch<{
    rules: RiskRuleRow[];
    signals: RiskSignalRow[];
    actions: RiskActionRow[];
  }>(url);
  const rules = data?.rules ?? [];
  const signals = data?.signals ?? [];
  const actions = data?.actions ?? [];
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(rules.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = rules.slice((safePage - 1) * pageSize, safePage * pageSize);
  const [confirm, setConfirm] = useState<RiskRuleRow | null>(null);
  const [toggleBusy, setToggleBusy] = useState<string | null>(null);

  const toggleRiskRule = async () => {
    if (!confirm) return;
    const r = confirm;
    setToggleBusy(r.id);
    try {
      await api(`/api/owner/risk-rules/${r.id}/toggle`, { method: "POST" });
      toast(`Risk rule “${r.name}” ${r.active ? "disabled" : "enabled"}`, "win");
      setConfirm(null);
      reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not toggle the rule", "lose");
    } finally {
      setToggleBusy(null);
    }
  };

  const signalLabel = (r: RiskRuleRow) => signals.find((s) => s.key === r.signal)?.label ?? r.signal;
  const actionLabel = (r: RiskRuleRow) => actions.find((a) => a.key === r.action)?.label ?? r.action;
  const actionNote = (r: RiskRuleRow) => actions.find((a) => a.key === r.action)?.note ?? "";
  // Enabling a rule that auto-blocks players or auto-holds withdrawals
  // is the dangerous direction; disabling a rule only stops it acting.
  const confirmDanger = confirm !== null && !confirm.active && (confirm.action === "block_player" || confirm.action === "hold_withdrawal");

  const columns: DataColumn<RiskRuleRow>[] = [
    {
      key: "rule",
      label: "Rule",
      render: (r) => r.name,
      sub: (r) => `Created ${fmtDate(r.createdAt)}`,
    },
    {
      key: "signal",
      label: "Signal",
      render: (r) => signalLabel(r),
      details: (r) => [["Signal", signalLabel(r)]],
    },
    {
      key: "threshold",
      label: "Threshold",
      render: (r) => String(r.threshold),
      details: (r) => [["Threshold", String(r.threshold)]],
    },
    {
      key: "action",
      label: "Action",
      render: (r) => actionLabel(r),
      details: (r) => {
        const out: [string, ReactNode][] = [["Action", actionLabel(r)]];
        const note = actionNote(r);
        if (note) out.push(["Effect", note]);
        return out;
      },
    },
    {
      key: "status",
      label: "Status",
      render: (r) => (r.active ? <Badge variant="ok">Active</Badge> : <Badge variant="muted">Disabled</Badge>),
      details: (r) => [
        ["Status", r.active ? <Badge key="st" variant="ok">Active</Badge> : <Badge key="st" variant="muted">Disabled</Badge>],
      ],
    },
  ];

  return (
    <div>
      <PageHeader title="Risk rules" sub="Fraud signals, thresholds, actions." />
      <OwnerRangeBar />
      {loading ? (
        <Skeleton lines={5} title />
      ) : err ? (
        <ErrorState text={err} onRetry={reload} />
      ) : (
        <>
          <Card title="Create rule">
            <RiskRuleForm key={JSON.stringify({ signals, actions })} signals={signals} actions={actions} onSaved={reload} />
          </Card>
          <Card title="Rules">
            <DataTable<RiskRuleRow>
              viewId="owner-risk-rules"
              columns={columns}
              rows={pageRows}
              total={rules.length}
              page={safePage}
              pageSize={pageSize}
              onPageChange={setPage}
              loading={false}
              error={null}
              emptyTitle="No risk rules yet."
              emptyText="The fraud console still flags, but nothing is blocked or held automatically."
              rowActions={[
                {
                  label: "Enable",
                  onClick: (r) => setConfirm(r),
                  disabled: (r) => r.active || toggleBusy === r.id,
                },
                {
                  label: "Disable",
                  danger: true,
                  onClick: (r) => setConfirm(r),
                  disabled: (r) => !r.active || toggleBusy === r.id,
                },
              ]}
            />
          </Card>
          <ConfirmDialog
            open={confirm !== null}
            onClose={() => setConfirm(null)}
            onConfirm={() => void toggleRiskRule()}
            title={confirm ? `${confirm.active ? "Disable" : "Enable"} risk rule “${confirm.name}”` : "Toggle risk rule"}
            body={
              confirm
                ? confirm.active
                  ? "While disabled, this rule is never evaluated — the fraud console still shows its signal's alerts, but the rule takes no action."
                  : `${actionNote(confirm)} While active, this rule runs automatically whenever its signal fires.`
                : undefined
            }
            facts={
              confirm
                ? [
                    { label: "Rule", value: confirm.name },
                    { label: "Signal", value: signalLabel(confirm) },
                    { label: "Threshold", value: String(confirm.threshold) },
                    { label: "Action", value: actionLabel(confirm) },
                    { label: "Current", value: confirm.active ? "Active" : "Disabled" },
                    { label: "New", value: confirm.active ? "Disabled" : "Active" },
                  ]
                : []
            }
            confirmLabel={confirm?.active ? "Disable rule" : "Enable rule"}
            danger={confirmDanger}
            busy={toggleBusy !== null}
          />
        </>
      )}
    </div>
  );
}
