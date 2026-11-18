// Owner Platform settings (Phase 2) — split out of the old one-page owner panel
// (src/app/owner/legacy/page.tsx). Same sections, same endpoints, same
// behaviour — now its own route, loading only its own data.
"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../lib/api";
import { useStore } from "../../../../lib/store";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";

export default function OwnerPlatformPage() {
  const { user, toast } = useStore();
  // O21: platform settings & branding — site name, support contact,
  // maintenance mode (the money fields live in Wallet config).
  interface PlatSettings { siteName: string; supportContact: string; maintenanceMode: boolean }
  const [platSettings, setPlatSettings] = useState<PlatSettings | null>(null);
  const [platSiteName, setPlatSiteName] = useState("");
  const [platSupport, setPlatSupport] = useState("");
  const [platMaint, setPlatMaint] = useState(false);
  const [platBusy, setPlatBusy] = useState(false);
  const loadPlatSettings = useCallback(async () => {
    try {
      const r = await api<{ settings: PlatSettings }>("/api/owner/platform/settings");
      setPlatSettings(r.settings);
      setPlatSiteName(r.settings.siteName);
      setPlatSupport(r.settings.supportContact);
      setPlatMaint(r.settings.maintenanceMode);
    } catch { setPlatSettings(null); }
  }, []);
  useEffect(() => { if (user) void loadPlatSettings(); }, [loadPlatSettings, user]);

  // P1 Batch 4 (O21): platform settings & branding.
  const savePlatSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setPlatBusy(true);
    try {
      await api("/api/owner/platform/settings", {
        method: "POST",
        body: JSON.stringify({ siteName: platSiteName.trim(), supportContact: platSupport.trim(), maintenanceMode: platMaint }),
      });
      toast("Platform settings saved", "win");
      await loadPlatSettings();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not save platform settings", "lose");
    } finally { setPlatBusy(false); }
  };
  return (
    <div>
      <PageHeader title="Platform settings" sub="Site name, support contact, maintenance mode." />
      <OwnerRangeBar />
      <section className="admin-sec">
      <h3>Platform settings</h3>
      {platSettings === null ? <p>Loading platform settings…</p> : (
        <form className="owner-add" onSubmit={savePlatSettings}>
          <label>Site name <input type="text" value={platSiteName} onChange={(e) => setPlatSiteName(e.target.value)} maxLength={60} required /></label>
          <label>Support contact <input type="text" value={platSupport} onChange={(e) => setPlatSupport(e.target.value)} maxLength={120} placeholder="Email or WhatsApp number" /></label>
          <label><input type="checkbox" checked={platMaint} onChange={(e) => setPlatMaint(e.target.checked)} /> Maintenance mode</label>
          <button className="btn btn-gold" type="submit" disabled={platBusy}>{platBusy ? "Saving…" : "Save platform settings"}</button>
        </form>
      )}
      </section>
    </div>
  );
}
