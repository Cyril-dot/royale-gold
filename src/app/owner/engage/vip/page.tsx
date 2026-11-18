// Owner VIP tiers (Phase 4 restyle) — split out of the old one-page
// owner panel (deleted in Phase 4). Same endpoints, same
// behaviour, staff-ui throughout: the editable tier form in a Card,
// Skeleton while loading, ErrorState with retry. Saving replaces all
// tiers (the endpoint's own contract) — the validation the legacy
// form had (every tier named, one tier starting at GH₵ 0) is kept.
"use client";

import { useState } from "react";
import { api } from "../../../../lib/api";
import { useStore } from "../../../../lib/store";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { Card } from "../../../../components/staff-ui/Card";
import { Button } from "../../../../components/staff-ui/Button";
import { FormField, Input } from "../../../../components/staff-ui/Form";
import { Skeleton, ErrorState } from "../../../../components/staff-ui/Feedback";
import { useOwnerFetch } from "../../../../components/owner/useOwnerFetch";

// P2 Batch 1 (A26): VIP tiers — the OWNER edits the thresholds here
// (name, min deposited, perks). The tiers are computed live from the
// deposit ledger; one tier must start at GH₵ 0. Save replaces all.
interface VipTierRow {
  id: string;
  name: string;
  minDeposited: number;
  perks: string[];
  sortOrder: number;
}

export default function OwnerVipPage() {
  const { user, toast } = useStore();
  const url = user ? "/api/owner/vip-tiers" : null;
  const { data, err, loading, reload } = useOwnerFetch<{ tiers: VipTierRow[] }>(url);

  // Editable copy of the fetched tiers. Synced from the fetch result
  // during render (the supported render-phase adjustment) whenever a
  // NEW fetch lands — reference comparison, so typing in the form
  // never gets clobbered by a re-render.
  const fetched = data?.tiers ?? null;
  const [vipTiers, setVipTiers] = useState<VipTierRow[] | null>(null);
  const [synced, setSynced] = useState<VipTierRow[] | null>(null);
  if (fetched !== null && synced !== fetched) {
    setSynced(fetched);
    setVipTiers(fetched);
  }

  const [vipBusy, setVipBusy] = useState(false);
  const saveVipTiers = async (e: React.FormEvent) => {
    e.preventDefault();
    const tiers = (vipTiers ?? []).map((t, i) => ({
      name: t.name.trim(),
      minDeposited: Number(t.minDeposited),
      perks: t.perks.join(", "),
      sortOrder: i,
    }));
    if (tiers.some((t) => !t.name)) {
      toast("Every tier needs a name", "lose");
      return;
    }
    if (tiers.length === 0 || Math.min(...tiers.map((t) => t.minDeposited)) !== 0) {
      toast("One tier must start at GH₵ 0", "lose");
      return;
    }
    setVipBusy(true);
    try {
      await api("/api/owner/vip-tiers", { method: "POST", body: JSON.stringify({ tiers }) });
      toast("VIP tiers saved", "win");
      reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "VIP tiers failed", "lose");
    } finally {
      setVipBusy(false);
    }
  };
  const setVipTier = (idx: number, patch: Partial<VipTierRow>) => {
    setVipTiers((cur) => (cur ?? []).map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  };
  const tiers = vipTiers ?? [];

  return (
    <div>
      <PageHeader title="VIP tiers" sub="Thresholds and perks." />
      <OwnerRangeBar />
      <Card title="VIP tiers" sub="One tier must start at GH₵ 0. Saving replaces all tiers.">
        {loading && vipTiers === null ? (
          <Skeleton lines={5} />
        ) : err ? (
          <ErrorState text={err} onRetry={reload} />
        ) : (
          <form onSubmit={saveVipTiers}>
            {tiers.length === 0 ? <p>No tiers yet — add one below.</p> : null}
            {tiers.map((t, i) => (
              <div key={t.id}>
                <h4>
                  Tier {i + 1}
                  {t.name ? ` — ${t.name}` : ""}
                </h4>
                <FormField label="Name" required>
                  <Input
                    type="text"
                    value={t.name}
                    onChange={(e) => setVipTier(i, { name: e.target.value })}
                    aria-label={`Tier ${i + 1} name`}
                    maxLength={40}
                  />
                </FormField>
                <FormField label="Min deposited (GH₵)">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={t.minDeposited}
                    onChange={(e) => setVipTier(i, { minDeposited: Number(e.target.value) })}
                    aria-label={`Tier ${i + 1} minimum deposited`}
                  />
                </FormField>
                <FormField label="Perks (comma-separated)">
                  <Input
                    type="text"
                    value={t.perks.join(", ")}
                    onChange={(e) =>
                      setVipTier(i, { perks: e.target.value.split(",").map((p) => p.trim()).filter(Boolean) })
                    }
                    aria-label={`Tier ${i + 1} perks`}
                    placeholder="Priority support, Higher limits"
                  />
                </FormField>
                <Button variant="ghost" onClick={() => setVipTiers((cur) => (cur ?? []).filter((_, j) => j !== i))}>
                  Remove tier {i + 1}
                </Button>
              </div>
            ))}
            <Button
              variant="secondary"
              onClick={() =>
                setVipTiers((cur) => [
                  ...(cur ?? []),
                  { id: `new-${Date.now()}`, name: "", minDeposited: 0, perks: [], sortOrder: (cur ?? []).length },
                ])
              }
            >
              Add tier
            </Button>{" "}
            <Button variant="primary" type="submit" loading={vipBusy}>
              Save tiers
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
