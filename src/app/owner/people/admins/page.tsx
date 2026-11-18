// Owner Admins (Phase 2) — split out of the old one-page owner panel
// (src/app/owner/legacy/page.tsx). Same sections, same endpoints, same
// behaviour — now its own route, loading only its own data.
"use client";

import { useEffect, useRef, useState } from "react";
import { api, fmtMoney } from "../../../../lib/api";
import { COUNTRIES } from "../../../../lib/country";
import { copyText } from "../../../../lib/admin-client";
import Link from "next/link";
import { useStore } from "../../../../lib/store";
import { useOwner } from "../../../../components/owner/OwnerContext";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { OwnerAdminPerms } from "../../../../components/owner/OwnerAdminPerms";
import type { AdminRow } from "../../../../components/owner/owner-types";

export default function OwnerAdminsPage() {
  const { user, toast } = useStore();
  const { admins: ctxAdmins, loadAdmins } = useOwner();
  const admins = ctxAdmins ?? [];
  useEffect(() => { if (user) void loadAdmins(); }, [loadAdmins, user]);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Per-admin referral link copy (first active code) — the admin's own
  // panel lives on the /admin routes; "Preview panel" links there with
  // ?preview=<adminId>.
  const copyAdminLink = (a: AdminRow) => {
    const c = a.codes.find((x) => x.active) ?? a.codes[0];
    if (!c) return;
    const link = `${window.location.origin}/?ref=${c.code}`;
    void copyText(link).then(() => {
      setCopiedId(a.id);
      toast("Referral link copied", "win");
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopiedId(null), 1600);
    }).catch(() => toast("Copy failed — long-press the link to copy it", "lose"));
  };
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pct, setPct] = useState(10);
  // Phase 1 country-based (Nov 2026): the new admin's country — the
  // fiat follows it (GH → GHS, NG → NGN).
  const [adminCountry, setAdminCountry] = useState("GH");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Record<string, number>>({});

  // O24: the parent picker per admin — the select's value is the admin's
  // current parent; changing it saves at once. One busy id at a time.
  const [parentBusy, setParentBusy] = useState<string | null>(null);

  const addAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/owner/admins", { method: "POST", body: JSON.stringify({ name: name.trim(), email: email.trim(), password, commissionPct: pct, country: adminCountry }) });
      setName(""); setEmail(""); setPassword(""); setPct(10); setAdminCountry("GH");
      toast("Admin added", "win");
      await loadAdmins();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not add admin", "lose");
    } finally { setBusy(false); }
  };

  const savePct = async (id: string) => {
    const v = editing[id];
    if (v === undefined) return;
    try {
      await api(`/api/owner/admins/${id}`, { method: "PATCH", body: JSON.stringify({ commissionPct: v }) });
      toast("Commission % updated — future deposits only", "win");
      await loadAdmins();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Update failed", "lose");
    }
  };

  const toggleActive = async (a: AdminRow) => {
    try {
      await api(`/api/owner/admins/${a.id}`, { method: "PATCH", body: JSON.stringify({ active: !a.active }) });
      toast(a.active ? "Admin deactivated" : "Admin reactivated", "win");
      await loadAdmins();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Update failed", "lose");
    }
  };

  // P1 Batch 4 (O24): set or clear an admin's parent admin.
  const saveParent = async (adminId: string, parentAdminId: string) => {
    setParentBusy(adminId);
    try {
      await api(`/api/owner/admins/${adminId}/parent`, { method: "POST", body: JSON.stringify({ parentAdminId: parentAdminId || null }) });
      toast(parentAdminId ? "Parent admin set — their panel now rolls this downline in" : "Parent admin cleared", "win");
      await loadAdmins();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not set parent admin", "lose");
    } finally { setParentBusy(null); }
  };
  return (
    <div>
      <PageHeader title="Admins" sub="Add, edit, deactivate and preview admins." />
      <OwnerRangeBar />
      <section className="admin-sec">
      <h3>Add admin</h3>
      <form className="owner-add" onSubmit={addAdmin}>
        <input type="text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        <label>Commission % <input type="number" min={0} max={100} value={pct} onChange={(e) => setPct(Number(e.target.value))} /></label>
        <label>Country <select value={adminCountry} onChange={(e) => setAdminCountry(e.target.value)} aria-label="New admin country">
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>{c.name} ({c.currency})</option>
          ))}
        </select></label>
        <button className="btn btn-gold" type="submit" disabled={busy}>{busy ? "Adding…" : "Add admin"}</button>
      </form>
      </section>

      <section className="admin-sec">
      <h3>All admins ({admins.length})</h3>
      {admins.map((a) => (
        <div key={a.id} className="admin-row">
          <div>
            <b>{a.name}</b> <span>{a.email}</span> <span className={a.active ? "ok" : "bad"}>{a.active ? "Active" : "Deactivated"}</span>
            <div className="admin-meta">Codes: {a.codes.map((c) => c.code).join(", ") || "—"} · Referrals: {a.referralCount} · Coins given: {a.coinsGiven} · Commission all-time: {fmtMoney(a.commissionAllTime, a.commissionCurrency ?? a.currency ?? "GHS")}{a.country ? ` · ${COUNTRIES.find((c) => c.code === a.country)?.name ?? a.country}` : ""}{a.parentName ? ` · Parent: ${a.parentName}` : ""}</div>
          </div>
          <div className="admin-edit">
            <label>% <input type="number" min={0} max={100} defaultValue={a.commissionPct ?? 0} onChange={(e) => setEditing((ed) => ({ ...ed, [a.id]: Number(e.target.value) }))} /></label>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => void savePct(a.id)}>Save %</button>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => void toggleActive(a)}>{a.active ? "Deactivate" : "Reactivate"}</button>
            {/* P1 Batch 4 (O24): the parent admin — a senior agent
                whose panel rolls this admin's downline in (read-only).
                Two levels only: only an admin with no parent of their
                own can be a parent. */}
            <label>Parent <select value={a.parentAdminId ?? ""} disabled={parentBusy === a.id} onChange={(e) => void saveParent(a.id, e.target.value)} aria-label={`Parent admin for ${a.name}`}>
              <option value="">No parent</option>
              {admins.filter((p) => p.id !== a.id && !p.parentAdminId).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select></label>
            {a.codes.length > 0 && (
              <button className={`btn btn-ghost btn-sm${copiedId === a.id ? " done" : ""}`} type="button" onClick={() => copyAdminLink(a)}>
                {copiedId === a.id ? "Copied ✓" : "Copy referral link"}
              </button>
            )}
            <Link className="btn btn-gold btn-sm" href={`/admin?preview=${a.id}`}>Preview panel</Link>
          </div>
          <OwnerAdminPerms a={a} onSaved={loadAdmins} />
        </div>
      ))}
      </section>
    </div>
  );
}
