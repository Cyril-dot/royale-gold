import { useState } from "react";
import { api } from "../../lib/api";
import { useStore } from "../../lib/store";
import { ADMIN_SECTIONS, ADMIN_SECTION_LABELS, type AdminSection } from "../../lib/rbac";
import type { AdminRow } from "./owner-types";

// P0 Batch 3 (O2/O15) — per-admin permissions editor + "Kill all
// sessions". Checkboxes for the 7 sections; "All sections" (null) is
// the default. Saving PATCHes the admin; killing sessions bumps their
// session version so every JWT they hold stops working at once.
export function OwnerAdminPerms({ a, onSaved }: {
  a: AdminRow;
  onSaved: () => Promise<void>;
}) {
  const { toast } = useStore();
  const [perms, setPerms] = useState<string[] | null>(a.permissions);
  const [busy, setBusy] = useState(false);
  const [killBusy, setKillBusy] = useState(false);
  const toggle = (s: AdminSection) => {
    setPerms((cur) => {
      const all = cur ?? [...ADMIN_SECTIONS];
      return all.includes(s) ? all.filter((x) => x !== s) : [...all, s];
    });
  };
  const save = async () => {
    setBusy(true);
    try {
      // All 7 checked = "all sections" (null) — the stored form.
      const list = perms === null ? null : perms.length >= ADMIN_SECTIONS.length ? null : perms;
      await api(`/api/owner/admins/${a.id}`, { method: "PATCH", body: JSON.stringify({ permissions: list }) });
      toast(`Permissions saved for ${a.name}`, "win");
      await onSaved();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not save permissions", "lose");
    } finally { setBusy(false); }
  };
  const kill = async () => {
    setKillBusy(true);
    try {
      await api(`/api/owner/admins/${a.id}/kill-sessions`, { method: "POST" });
      toast(`All sessions killed for ${a.name} — they must sign in again`, "win");
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not kill sessions", "lose");
    } finally { setKillBusy(false); }
  };
  const checked = (s: AdminSection) => (perms === null ? true : perms.includes(s));
  return (
    <div className="ow-perms">
      <span className="ow-perms-label">Sections this admin can open:</span>
      <div className="ow-perms-checks">
        {ADMIN_SECTIONS.map((s) => (
          <label key={s} className="ow-perm-check">
            <input type="checkbox" checked={checked(s)} onChange={() => toggle(s)} /> {ADMIN_SECTION_LABELS[s]}
          </label>
        ))}
      </div>
      <div className="ow-perms-actions">
        <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save permissions"}</button>
        <button className="btn btn-ghost btn-sm" type="button" disabled={killBusy} onClick={() => void kill()}>{killBusy ? "Killing…" : "Kill all sessions"}</button>
        {a.totpEnabled ? <span className="ow-2fa-on">2FA on</span> : null}
      </div>
    </div>
  );
}
