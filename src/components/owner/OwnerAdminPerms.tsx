// OwnerAdminPerms — per-admin permissions editor + "Kill all sessions"
// (Phase 4 restyle; was legacy markup until the monolith was deleted).
// Checkboxes for the 14 sections; "All sections" (null) is the default.
// Saving PATCHes the admin; killing sessions bumps their session version
// so every JWT they hold stops working at once (server-audited).
// Kill goes through the shared ConfirmDialog — it signs the admin out
// everywhere at once. The PATCH accepts no reason, so no reason is
// collected for either action.
"use client";

import { useState } from "react";
import { api } from "../../lib/api";
import { useStore } from "../../lib/store";
import { ADMIN_SECTIONS, ADMIN_SECTION_LABELS, type AdminSection } from "../../lib/rbac";
import type { AdminRow } from "./owner-types";
import { Button } from "../staff-ui/Button";
import { Badge } from "../staff-ui/Badge";
import { ConfirmDialog } from "../staff-ui/Dialog";

export function OwnerAdminPerms({ a, onSaved }: {
  a: AdminRow;
  onSaved: () => Promise<void>;
}) {
  const { toast } = useStore();
  const [perms, setPerms] = useState<string[] | null>(a.permissions);
  const [busy, setBusy] = useState(false);
  const [killBusy, setKillBusy] = useState(false);
  const [confirmKill, setConfirmKill] = useState(false);
  const toggle = (s: AdminSection) => {
    setPerms((cur) => {
      const all = cur ?? [...ADMIN_SECTIONS];
      return all.includes(s) ? all.filter((x) => x !== s) : [...all, s];
    });
  };
  const save = async () => {
    setBusy(true);
    try {
      // All sections checked = "all sections" (null) — the stored form.
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
      setConfirmKill(false);
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not kill sessions", "lose");
    } finally { setKillBusy(false); }
  };
  const checked = (s: AdminSection) => (perms === null ? true : perms.includes(s));
  return (
    <div>
      <span className="st-field-label">Sections this admin can open:</span>
      <div className="st-checks">
        {ADMIN_SECTIONS.map((s) => (
          <label key={s} className="st-check">
            <input type="checkbox" checked={checked(s)} onChange={() => toggle(s)} /> {ADMIN_SECTION_LABELS[s]}
          </label>
        ))}
      </div>
      <div className="st-btn-row">
        <Button variant="ghost" size="sm" loading={busy} onClick={() => void save()}>
          Save permissions
        </Button>
        <Button variant="danger" size="sm" loading={killBusy} onClick={() => setConfirmKill(true)}>
          Kill all sessions
        </Button>
        {a.totpEnabled ? <Badge variant="ok">2FA on</Badge> : null}
      </div>
      <ConfirmDialog
        open={confirmKill}
        onClose={() => setConfirmKill(false)}
        onConfirm={() => void kill()}
        title="Kill all sessions"
        body="Every device this admin is signed in on is signed out at once. They must sign in again."
        facts={[{ label: "Admin", value: a.name }]}
        confirmLabel="Kill all sessions"
        danger
        busy={killBusy}
      />
    </div>
  );
}
