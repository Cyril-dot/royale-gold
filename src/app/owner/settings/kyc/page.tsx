// Owner KYC / AML settings (Phase 4 restyle) — split out of the old one-page
// owner panel (deleted in Phase 4). Same endpoint, same
// behaviour, staff-ui throughout.
"use client";

import { useMemo, useState } from "react";
import { api } from "../../../../lib/api";
import { useStore } from "../../../../lib/store";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { Card } from "../../../../components/staff-ui/Card";
import { Button } from "../../../../components/staff-ui/Button";
import { FormField, Input } from "../../../../components/staff-ui/Form";
import { Skeleton, ErrorState } from "../../../../components/staff-ui/Feedback";
import { fmtStaffMoney } from "../../../../components/staff-ui/format";
import { useOwnerFetch } from "../../../../components/owner/useOwnerFetch";

// O22: KYC/AML settings — accepted document types, the auto-approve
// rule (URL-host allow-list), and the withdrawal KYC threshold.
interface KycSettingsRow {
  acceptedTypes: string[];
  autoApprove: boolean;
  autoApproveHosts: string[];
  withdrawalKycThreshold: number;
}

const KYC_TYPES = [
  { type: "national_id", label: "National ID" },
  { type: "passport", label: "Passport" },
  { type: "drivers_licence", label: "Driver's licence" },
];

/** The KYC form. Remounted (via key) whenever the loaded settings
 *  change, so the fields always start from the saved values — no
 *  setState-in-effect hydration. */
function KycForm({ initial, onSaved }: { initial: KycSettingsRow; onSaved: () => void }) {
  const { toast } = useStore();
  const [typesSel, setTypesSel] = useState<string[]>(initial.acceptedTypes);
  const [auto, setAuto] = useState(initial.autoApprove);
  const [hosts, setHosts] = useState(initial.autoApproveHosts.join(", "));
  const [threshold, setThreshold] = useState(String(initial.withdrawalKycThreshold));
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (typesSel.length === 0) {
      toast("Pick at least one accepted document type", "lose");
      return;
    }
    setBusy(true);
    try {
      await api("/api/owner/kyc-settings", {
        method: "POST",
        body: JSON.stringify({
          acceptedTypes: typesSel,
          autoApprove: auto,
          autoApproveHosts: hosts.trim(),
          withdrawalKycThreshold: Number(threshold) || 0,
        }),
      });
      toast("KYC/AML settings saved", "win");
      onSaved();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not save KYC settings", "lose");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save}>
      <FormField label="Accepted document types" required>
        <span>
          {KYC_TYPES.map((t) => (
            <label key={t.type} style={{ display: "block", minHeight: 44 }}>
              <input
                type="checkbox"
                checked={typesSel.includes(t.type)}
                onChange={() =>
                  setTypesSel((cur) => (cur.includes(t.type) ? cur.filter((x) => x !== t.type) : [...cur, t.type]))
                }
              />{" "}
              {t.label}
            </label>
          ))}
        </span>
      </FormField>
      <FormField label="Auto-approve" hint="Documents hosted on the allow-listed hosts below are approved automatically.">
        <label style={{ display: "block", minHeight: 44 }}>
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto-approve from
          allow-listed hosts
        </label>
      </FormField>
      <FormField label="Allow-listed hosts" hint="Comma-separated, e.g. imgbb.com, ibb.co">
        <Input
          type="text"
          value={hosts}
          onChange={(e) => setHosts(e.target.value)}
          placeholder="e.g. imgbb.com, ibb.co"
          aria-label="Allow-listed hosts"
          autoComplete="off"
        />
      </FormField>
      <FormField
        label="Withdrawal KYC threshold (GH₵)"
        hint={`Currently ${fmtStaffMoney(initial.withdrawalKycThreshold, "GHS")}. Withdrawals above this amount are flagged on the queue until KYC is verified. It adds a warning flag — it never blocks a withdrawal.`}
      >
        <Input
          type="number"
          min={0}
          step={1}
          inputMode="decimal"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          aria-label="Withdrawal KYC threshold in Ghana cedi"
        />
      </FormField>
      <Button variant="primary" type="submit" loading={busy}>
        Save KYC settings
      </Button>
    </form>
  );
}

export default function OwnerKycPage() {
  const { user } = useStore();
  const url = useMemo(() => (user ? "/api/owner/kyc-settings" : null), [user]);
  const { data, err, loading, reload } = useOwnerFetch<{ settings: KycSettingsRow }>(url);
  const settings = data?.settings ?? null;
  return (
    <div>
      <PageHeader title="KYC / AML settings" sub="Accepted documents, auto-approve, thresholds." />
      <OwnerRangeBar />
      {loading ? (
        <Skeleton lines={5} title />
      ) : err ? (
        <ErrorState text={err} onRetry={reload} />
      ) : settings ? (
        <Card title="KYC / AML settings">
          <KycForm key={JSON.stringify(settings)} initial={settings} onSaved={reload} />
        </Card>
      ) : null}
    </div>
  );
}
