// Owner Platform settings (Phase 4 restyle) — split out of the old one-page
// owner panel (deleted in Phase 4). Same endpoint, same
// behaviour, staff-ui throughout. Maintenance mode lives in its own
// danger zone: current-state badge, plain-language effect, typed
// confirmation. The global game kill switch is NOT here — it lives on
// the Games page. The settings form and the maintenance flip post
// separately (the endpoint accepts partial updates), so saving the
// site name never flips maintenance by accident.
"use client";

import { useMemo, useState } from "react";
import { api } from "../../../../lib/api";
import { useStore } from "../../../../lib/store";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { Card } from "../../../../components/staff-ui/Card";
import { Button } from "../../../../components/staff-ui/Button";
import { FormField, Input } from "../../../../components/staff-ui/Form";
import { Badge } from "../../../../components/staff-ui/Badge";
import { ConfirmDialog } from "../../../../components/staff-ui/Dialog";
import { Skeleton, ErrorState } from "../../../../components/staff-ui/Feedback";
import { useOwnerFetch } from "../../../../components/owner/useOwnerFetch";

// O21: platform settings & branding — site name, support contact,
// maintenance mode (the money fields live in Wallet config).
interface PlatSettings {
  siteName: string;
  supportContact: string;
  maintenanceMode: boolean;
}

/** The site-name / support-contact form. Remounted (via key) whenever
 *  the loaded settings change, so the fields always start from the
 *  saved values — no setState-in-effect hydration. */
function PlatformSettingsForm({ initial, onSaved }: { initial: PlatSettings; onSaved: () => void }) {
  const { toast } = useStore();
  const [siteName, setSiteName] = useState(initial.siteName);
  const [support, setSupport] = useState(initial.supportContact);
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/owner/platform/settings", {
        method: "POST",
        body: JSON.stringify({ siteName: siteName.trim(), supportContact: support.trim() }),
      });
      toast("Platform settings saved", "win");
      onSaved();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not save platform settings", "lose");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save}>
      <FormField label="Site name" required>
        <Input type="text" value={siteName} onChange={(e) => setSiteName(e.target.value)} maxLength={60} required aria-label="Site name" />
      </FormField>
      {/* Support contact is the site's own public contact, not a
          player's private data: the owner edits it here, so it is
          shown in full in the input. POST /api/owner/reveal has no
          kind for a platform setting, so no audited reveal applies. */}
      <FormField label="Support contact" hint="Shown to players as the support contact. Email or WhatsApp number.">
        <Input
          type="text"
          value={support}
          onChange={(e) => setSupport(e.target.value)}
          maxLength={120}
          placeholder="Email or WhatsApp number"
          aria-label="Support contact"
          autoComplete="off"
        />
      </FormField>
      <Button variant="primary" type="submit" loading={busy}>
        Save platform settings
      </Button>
    </form>
  );
}

export default function OwnerPlatformPage() {
  const { user, toast } = useStore();
  const url = useMemo(() => (user ? "/api/owner/platform/settings" : null), [user]);
  const { data, err, loading, reload } = useOwnerFetch<{ settings: PlatSettings }>(url);
  const settings = data?.settings ?? null;
  const [maintTarget, setMaintTarget] = useState<boolean | null>(null);
  const [maintBusy, setMaintBusy] = useState(false);

  const flipMaintenance = async () => {
    if (maintTarget === null || !settings) return;
    setMaintBusy(true);
    try {
      await api("/api/owner/platform/settings", {
        method: "POST",
        body: JSON.stringify({ maintenanceMode: maintTarget }),
      });
      toast(`Maintenance mode turned ${maintTarget ? "on" : "off"} — logged in the audit log`, "win");
      setMaintTarget(null);
      reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not change maintenance mode", "lose");
    } finally {
      setMaintBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Platform settings" sub="Site name, support contact, maintenance mode." />
      <OwnerRangeBar />
      {loading ? (
        <Skeleton lines={5} title />
      ) : err ? (
        <ErrorState text={err} onRetry={reload} />
      ) : settings ? (
        <>
          <Card title="Platform settings">
            <PlatformSettingsForm key={JSON.stringify(settings)} initial={settings} onSaved={reload} />
          </Card>
          <Card title="Danger zone" sub="Maintenance mode — read this before touching it." boxed>
            <p>
              {settings.maintenanceMode ? <Badge variant="danger">Maintenance ON</Badge> : <Badge variant="ok">Maintenance OFF</Badge>}
            </p>
            <p>
              When maintenance mode is ON, players see “Royale Gold is under maintenance — back soon” on the
              homepage and in game rooms, and cannot play.
            </p>
            <p>
              This is checked by the player pages in the browser only (client-side): it does not block API calls
              and it does not block staff access. Do not rely on it as a server-side shutdown.
            </p>
            <p>The global game kill switch lives on the Games page, not here.</p>
            <Button
              variant={settings.maintenanceMode ? "danger" : "primary"}
              loading={maintBusy}
              onClick={() => setMaintTarget(!settings.maintenanceMode)}
            >
              {settings.maintenanceMode ? "Turn maintenance off" : "Turn maintenance on"}
            </Button>
          </Card>
          <ConfirmDialog
            open={maintTarget !== null}
            onClose={() => setMaintTarget(null)}
            onConfirm={() => void flipMaintenance()}
            title={maintTarget ? "Turn maintenance mode on" : "Turn maintenance mode off"}
            body={
              maintTarget
                ? "Players will see the maintenance page on the homepage and in every game room, and will not be able to play. This is a client-side check in the player pages — it does not block API calls."
                : "Players will be able to play again."
            }
            facts={[
              { label: "Current", value: settings.maintenanceMode ? "Maintenance ON" : "Maintenance OFF" },
              { label: "New", value: maintTarget ? "Maintenance ON" : "Maintenance OFF" },
            ]}
            typedConfirm="MAINTENANCE"
            confirmLabel={maintTarget ? "Turn maintenance on" : "Turn maintenance off"}
            danger={maintTarget === true}
            busy={maintBusy}
          />
        </>
      ) : null}
    </div>
  );
}
