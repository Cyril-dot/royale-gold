// Owner Brands (Phase 2) — split out of the old one-page owner panel
// (src/app/owner/legacy/page.tsx). Same sections, same endpoints, same
// behaviour — now its own route, loading only its own data.
"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../lib/api";
import { useStore } from "../../../../lib/store";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";

export default function OwnerBrandsPage() {
  const { user, toast } = useStore();
  // O33: multi-brand support — CONFIG records only. A brand does NOT
  // change any page, game or URL (no per-brand routing or theming).
  interface BrandRow { id: string; name: string; slug: string; siteName: string; primaryColor: string; secondaryColor: string; active: boolean; createdAt: string }
  const [brands, setBrands] = useState<BrandRow[] | null>(null);
  const [brName, setBrName] = useState("");
  const [brSlug, setBrSlug] = useState("");
  const [brSite, setBrSite] = useState("");
  const [brPrimary, setBrPrimary] = useState("#F2C230");
  const [brSecondary, setBrSecondary] = useState("#0C2B22");
  const [brBusy, setBrBusy] = useState(false);
  const [brToggleBusy, setBrToggleBusy] = useState<string | null>(null);
  const loadBrands = useCallback(async () => {
    try { setBrands((await api<{ brands: BrandRow[] }>("/api/owner/brands")).brands); } catch { setBrands([]); }
  }, []);
  useEffect(() => { if (user) void loadBrands(); }, [loadBrands, user]);
  const createBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    setBrBusy(true);
    try {
      await api("/api/owner/brands", { method: "POST", body: JSON.stringify({ name: brName.trim(), slug: brSlug.trim(), siteName: brSite.trim() || undefined, primaryColor: brPrimary, secondaryColor: brSecondary }) });
      toast(`Brand “${brName.trim()}” created`, "win");
      setBrName(""); setBrSlug(""); setBrSite("");
      await loadBrands();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Brand failed", "lose");
    } finally { setBrBusy(false); }
  };
  const toggleBrand = async (b: BrandRow) => {
    setBrToggleBusy(b.id);
    try {
      await api(`/api/owner/brands/${b.id}/toggle`, { method: "POST" });
      toast(`Brand “${b.name}” ${b.active ? "disabled" : "enabled"}`, "win");
      await loadBrands();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not toggle the brand", "lose");
    } finally { setBrToggleBusy(null); }
  };
  return (
    <div>
      <PageHeader title="Brands" sub="Config records only — a brand changes no page, game or URL." />
      <OwnerRangeBar />
      <section className="admin-sec">
      <h3>Brands</h3>
      <form className="owner-add" onSubmit={createBrand}>
        <div className="pd-adjust-row">
          <label>Name
            <input type="text" value={brName} onChange={(e) => setBrName(e.target.value)} maxLength={60} aria-label="Brand name" placeholder="e.g. Royale Gold" />
          </label>
          <label>Slug
            <input type="text" value={brSlug} onChange={(e) => setBrSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} maxLength={40} aria-label="Brand slug" placeholder="e.g. royale-gold" />
          </label>
          <label>Site name
            <input type="text" value={brSite} onChange={(e) => setBrSite(e.target.value)} maxLength={60} aria-label="Brand site name" placeholder="Defaults to the name" />
          </label>
          <label>Primary colour
            <input type="color" value={brPrimary} onChange={(e) => setBrPrimary(e.target.value)} aria-label="Brand primary colour" />
          </label>
          <label>Secondary colour
            <input type="color" value={brSecondary} onChange={(e) => setBrSecondary(e.target.value)} aria-label="Brand secondary colour" />
          </label>
          <button className="btn btn-gold" type="submit" disabled={brBusy}>{brBusy ? "Creating…" : "Create brand"}</button>
        </div>
      </form>
      {brands === null ? <p>Loading brands…</p> : brands.length === 0 ? (
        <p>No brands yet.</p>
      ) : (
        <div className="rg48-twrap">
          <table className="dep-table">
            <thead><tr><th>Brand</th><th>Slug</th><th>Site name</th><th>Colours</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {brands.map((b) => (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td>{b.slug}</td>
                  <td>{b.siteName}</td>
                  <td><span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 3, background: b.primaryColor, verticalAlign: "middle" }} /> <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 3, background: b.secondaryColor, verticalAlign: "middle" }} /></td>
                  <td>{b.active ? "Active" : "Inactive"}</td>
                  <td><button className="btn btn-ghost btn-sm" type="button" disabled={brToggleBusy === b.id} onClick={() => void toggleBrand(b)}>{brToggleBusy === b.id ? "…" : b.active ? "Disable" : "Enable"}</button></td>
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
