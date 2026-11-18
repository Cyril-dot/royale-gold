// Owner KYC / AML settings (Phase 2) — split out of the old one-page owner panel
// (src/app/owner/legacy/page.tsx). Same sections, same endpoints, same
// behaviour — now its own route, loading only its own data.
"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../lib/api";
import { useStore } from "../../../../lib/store";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";

export default function OwnerKycPage() {
  const { user, toast } = useStore();
  // O22: KYC/AML settings — accepted document types, the auto-approve
  // rule (URL-host allow-list), and the withdrawal KYC threshold.
  interface KycSettingsRow { acceptedTypes: string[]; autoApprove: boolean; autoApproveHosts: string[]; withdrawalKycThreshold: number }
  const KYC_TYPES = [
    { type: "national_id", label: "National ID" },
    { type: "passport", label: "Passport" },
    { type: "drivers_licence", label: "Driver's licence" },
  ];
  const [kycSettings, setKycSettings] = useState<KycSettingsRow | null>(null);
  const [kycTypesSel, setKycTypesSel] = useState<string[]>(["national_id", "passport", "drivers_licence"]);
  const [kycAuto, setKycAuto] = useState(false);
  const [kycHosts, setKycHosts] = useState("");
  const [kycThreshold, setKycThreshold] = useState("0");
  const [kycBusy, setKycBusy] = useState(false);
  const loadKycSettings = useCallback(async () => {
    try {
      const r = await api<{ settings: KycSettingsRow }>("/api/owner/kyc-settings");
      setKycSettings(r.settings);
      setKycTypesSel(r.settings.acceptedTypes);
      setKycAuto(r.settings.autoApprove);
      setKycHosts(r.settings.autoApproveHosts.join(", "));
      setKycThreshold(String(r.settings.withdrawalKycThreshold));
    } catch { setKycSettings(null); }
  }, []);
  useEffect(() => { if (user) void loadKycSettings(); }, [loadKycSettings, user]);

  // P1 Batch 4 (O22): KYC/AML settings.
  const saveKycSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (kycTypesSel.length === 0) { toast("Pick at least one accepted document type", "lose"); return; }
    setKycBusy(true);
    try {
      await api("/api/owner/kyc-settings", {
        method: "POST",
        body: JSON.stringify({
          acceptedTypes: kycTypesSel,
          autoApprove: kycAuto,
          autoApproveHosts: kycHosts.trim(),
          withdrawalKycThreshold: Number(kycThreshold) || 0,
        }),
      });
      toast("KYC/AML settings saved", "win");
      await loadKycSettings();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not save KYC settings", "lose");
    } finally { setKycBusy(false); }
  };
  return (
    <div>
      <PageHeader title="KYC / AML settings" sub="Accepted documents, auto-approve, thresholds." />
      <OwnerRangeBar />
      <section className="admin-sec">
      <h3>KYC / AML settings</h3>
      {kycSettings === null ? <p>Loading KYC settings…</p> : (
        <form className="owner-add" onSubmit={saveKycSettings}>
          <span className="ow-perms-label">Accepted document types:</span>
          <div className="ow-perms-checks">
            {KYC_TYPES.map((t) => (
              <label key={t.type} className="ow-perm-check">
                <input type="checkbox" checked={kycTypesSel.includes(t.type)} onChange={() => setKycTypesSel((cur) => (cur.includes(t.type) ? cur.filter((x) => x !== t.type) : [...cur, t.type]))} /> {t.label}
              </label>
            ))}
          </div>
          <label><input type="checkbox" checked={kycAuto} onChange={(e) => setKycAuto(e.target.checked)} /> Auto-approve from allow-listed hosts</label>
          <label>Allow-listed hosts <input type="text" value={kycHosts} onChange={(e) => setKycHosts(e.target.value)} placeholder="e.g. imgbb.com, ibb.co" /></label>
          <label>Withdrawal KYC threshold GH₵ <input type="number" min={0} step={1} value={kycThreshold} onChange={(e) => setKycThreshold(e.target.value)} /></label>
          <button className="btn btn-gold" type="submit" disabled={kycBusy}>{kycBusy ? "Saving…" : "Save KYC settings"}</button>
        </form>
      )}
      </section>
    </div>
  );
}
