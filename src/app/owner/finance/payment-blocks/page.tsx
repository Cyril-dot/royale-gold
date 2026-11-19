// Owner Payment blocks (Nov 2026) — accounts and MoMo numbers paused
// after two failed PayTeller deposits in 24 hours. The owner lifts a
// block early here; every lift is audit-logged (action
// "payment_block.lift"). Numbers stay masked by default (D1) behind
// the audited reveal, like every other staff contact.
"use client";

import { useState } from "react";
import { api } from "../../../../lib/api";
import { useStore } from "../../../../lib/store";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { Card } from "../../../../components/staff-ui/Card";
import { DataTable, type DataColumn, type DataRowAction } from "../../../../components/staff-ui/DataTable";
import { ConfirmDialog } from "../../../../components/staff-ui/Dialog";
import { MaskedValue } from "../../../../components/staff-ui/MaskedValue";
import { maskPhone } from "../../../../components/staff-ui/format";
import { useOwnerFetch } from "../../../../components/owner/useOwnerFetch";

interface BlockRow {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  phoneNumber: string | null;
  blockedUntil: string;
  reason: string | null;
  createdAt: string;
}

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function OwnerPaymentBlocksPage() {
  const { toast } = useStore();
  const { data, err, loading, reload } = useOwnerFetch<{ blocks: BlockRow[] }>("/api/owner/payment-blocks");
  const [confirm, setConfirm] = useState<BlockRow | null>(null);
  const [busy, setBusy] = useState(false);
  const rows = data?.blocks ?? [];

  const lift = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await api(`/api/owner/payment-blocks/${confirm.id}`, { method: "DELETE" });
      toast(`Payment block lifted for ${confirm.userName ?? "player"}`, "win");
      setConfirm(null);
      reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not lift the block", "lose");
    } finally {
      setBusy(false);
    }
  };

  const rowActions: DataRowAction<BlockRow>[] = [
    {
      label: "Lift",
      onClick: (b) => setConfirm(b),
      disabled: () => busy,
    },
  ];

  // The number cell, shared by the desktop column AND the phone
  // card details — the card list renders `details` raw, so the raw
  // number must never be the details value (D1).
  const numberCell = (b: BlockRow) =>
    b.phoneNumber ? (
      <MaskedValue
        value={b.phoneNumber}
        kind="phone"
        label="Blocked number"
        onReveal={async () => {
          const r = await api<{ value: { email: string | null; phone: string | null } }>("/api/owner/reveal", {
            method: "POST",
            body: JSON.stringify({ kind: "user-contact", id: b.userId }),
          });
          return r.value.phone;
        }}
      />
    ) : (
      "—"
    );

  const columns: DataColumn<BlockRow>[] = [
    {
      key: "player",
      label: "Player",
      render: (b) => b.userName ?? "—",
      // D1: the contact is masked by default, like the withdrawals
      // page — the raw email never renders in the table.
      sub: (b) => {
        if (!b.userEmail) return "—";
        return (
          <MaskedValue
            value={b.userEmail}
            kind="email"
            label="Player contact"
            onReveal={async () => {
              const r = await api<{ value: { email: string | null; phone: string | null } }>("/api/owner/reveal", {
                method: "POST",
                body: JSON.stringify({ kind: "user-contact", id: b.userId }),
              });
              return r.value.email;
            }}
          />
        );
      },
      // NOTE: DataTable's phone CardList only reads `details` from
      // columns AFTER the first — the number detail lives on its own
      // column below, not here.
    },
    {
      key: "number",
      label: "Number",
      render: (b) => numberCell(b),
      details: (b) => [[ "Number", numberCell(b) ]],
    },
    {
      key: "until",
      label: "Blocked until",
      render: (b) => fmtWhen(b.blockedUntil),
      details: (b) => [[ "Blocked until", fmtWhen(b.blockedUntil) ]],
    },
    {
      key: "reason",
      label: "Reason",
      render: (b) => b.reason ?? "—",
      details: (b) => [[ "Reason", b.reason ?? "—" ]],
    },
    {
      key: "since",
      label: "Blocked since",
      render: (b) => fmtWhen(b.createdAt),
      details: (b) => [[ "Blocked since", fmtWhen(b.createdAt) ]],
    },
  ];

  return (
    <div>
      <PageHeader
        title="Payment blocks"
        sub="Accounts and numbers paused after two failed deposits in 24 hours. Lifting a block is audit-logged."
      />
      <Card title={`Payment blocks${rows.length > 0 ? ` — ${rows.length} active` : ""}`}>
        <DataTable<BlockRow>
          viewId="owner-payment-blocks"
          columns={columns}
          rows={rows}
          total={rows.length}
          page={1}
          pageSize={25}
          onPageChange={() => {}}
          loading={loading}
          error={err}
          onRetry={reload}
          emptyTitle="No payment blocks."
          emptyText="Nobody is blocked from deposits right now."
          rowActions={rowActions}
        />
      </Card>
      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => void lift()}
        title="Lift payment block"
        body="This account and number can deposit again immediately. The lift is written to the audit log."
        facts={
          confirm
            ? [
                { label: "Player", value: confirm.userName ?? "—" },
                { label: "Number", value: confirm.phoneNumber ? maskPhone(confirm.phoneNumber) : "—" },
                { label: "Blocked until", value: fmtWhen(confirm.blockedUntil) },
              ]
            : []
        }
        confirmLabel="Lift block"
        busy={busy}
      />
    </div>
  );
}
