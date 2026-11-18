// Owner VIP tiers (Phase 2) — split out of the old one-page owner panel
// (src/app/owner/legacy/page.tsx). Same sections, same endpoints, same
// behaviour — now its own route, loading only its own data.
"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../lib/api";
import { useStore } from "../../../../lib/store";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";

export default function OwnerVipPage() {
  const { user, toast } = useStore();
  // P2 Batch 1 (A26): VIP tiers — the OWNER edits the thresholds here
  // (name, min deposited, perks). The tiers are computed live from the
  // deposit ledger; one tier must start at GH₵ 0. Save replaces all.
  interface VipTierRow { id: string; name: string; minDeposited: number; perks: string[]; sortOrder: number }
  const [vipTiers, setVipTiers] = useState<VipTierRow[]>([]);
  const [vipBusy, setVipBusy] = useState(false);
  const loadVipTiers = useCallback(async () => {
    try {
      const r = await api<{ tiers: VipTierRow[] }>("/api/owner/vip-tiers");
      setVipTiers(r.tiers ?? []);
    } catch { setVipTiers([]); }
  }, []);
  useEffect(() => { if (user) void loadVipTiers(); }, [loadVipTiers, user]);
  const saveVipTiers = async (e: React.FormEvent) => {
    e.preventDefault();
    const tiers = vipTiers.map((t, i) => ({
      name: t.name.trim(),
      minDeposited: Number(t.minDeposited),
      perks: t.perks.join(", "),
      sortOrder: i,
    }));
    if (tiers.some((t) => !t.name)) { toast("Every tier needs a name", "lose"); return; }
    if (tiers.length === 0 || Math.min(...tiers.map((t) => t.minDeposited)) !== 0) {
      toast("One tier must start at GH₵ 0", "lose");
      return;
    }
    setVipBusy(true);
    try {
      await api("/api/owner/vip-tiers", { method: "POST", body: JSON.stringify({ tiers }) });
      toast("VIP tiers saved", "win");
      await loadVipTiers();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "VIP tiers failed", "lose");
    } finally { setVipBusy(false); }
  };
  const setVipTier = (idx: number, patch: Partial<VipTierRow>) => {
    setVipTiers((cur) => cur.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  };
  return (
    <div>
      <PageHeader title="VIP tiers" sub="Thresholds and perks." />
      <OwnerRangeBar />
      <section className="admin-sec">
      <h3>VIP tiers</h3>
      <form className="owner-add ow-form-rows" onSubmit={saveVipTiers}>
        {vipTiers.map((t, i) => (
          <div key={t.id} className="pd-adjust-row ow-stack">
            <label>Name
              <input type="text" value={t.name} onChange={(e) => setVipTier(i, { name: e.target.value })} aria-label={`Tier ${i + 1} name`} maxLength={40} />
            </label>
            <label>Min deposited (GH₵)
              <input type="number" min={0} step="0.01" inputMode="decimal" value={t.minDeposited} onChange={(e) => setVipTier(i, { minDeposited: Number(e.target.value) })} aria-label={`Tier ${i + 1} minimum deposited`} />
            </label>
            <label>Perks (comma-separated)
              <input type="text" value={t.perks.join(", ")} onChange={(e) => setVipTier(i, { perks: e.target.value.split(",").map((p) => p.trim()).filter(Boolean) })} aria-label={`Tier ${i + 1} perks`} placeholder="Priority support, Higher limits" />
            </label>
            <button className="btn btn-ghost" type="button" onClick={() => setVipTiers((cur) => cur.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
        <div className="pd-adjust-row ow-stack">
          <button className="btn btn-ghost" type="button" onClick={() => setVipTiers((cur) => [...cur, { id: `new-${Date.now()}`, name: "", minDeposited: 0, perks: [], sortOrder: cur.length }])}>Add tier</button>
          <button className="btn btn-gold" type="submit" disabled={vipBusy}>{vipBusy ? "Saving…" : "Save tiers"}</button>
        </div>
      </form>
      </section>
    </div>
  );
}
