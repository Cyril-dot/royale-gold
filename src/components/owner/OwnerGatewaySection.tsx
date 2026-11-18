// Phase 2 PayTeller (Nov 2026), Phase 3 restyle: the owner Gateway
// section — the 4 PayTeller fields (paste → encrypted, last-4 shown),
// the Ghana MoMo toggle (Demo / PayTeller), a Test connection button,
// and the webhook URL to register in PayTeller Settings. Blank fields
// keep the saved value; the toggle alone never needs the encryption
// key. Flipping the live gateway reroutes real money, so it goes
// through the shared ConfirmDialog; saving keys and testing do not.
import { useState } from "react";
import { api } from "../../lib/api";
import { useStore } from "../../lib/store";
import { Badge } from "../staff-ui/Badge";
import { Button } from "../staff-ui/Button";
import { CopyButton } from "../staff-ui/CopyButton";
import { ConfirmDialog } from "../staff-ui/Dialog";
import { FormField, Input } from "../staff-ui/Form";
import { Segmented } from "../staff-ui/Tabs";
import { Skeleton, ErrorState } from "../staff-ui/Feedback";
import { useOwnerFetch } from "./useOwnerFetch";

// Phase 2 PayTeller (Nov 2026): the owner Gateway section — the 4
// PayTeller fields (paste → encrypted, last-4 shown), the Ghana MoMo
// toggle (Demo / PayTeller), a Test connection button, and the webhook
// URL to register in PayTeller Settings. Blank fields keep the saved
// value; the toggle alone never needs the encryption key.
interface GatewaySettingsShape {
  ghMomoGateway: "demo" | "payteller";
  paytellerConfigured: boolean;
  paytellerApiKey: string | null;
  paytellerMerchantId: string | null;
  paytellerUsername: string | null;
  paytellerWebhookSecret: string | null;
  webhookUrl: string;
  updatedAt: string | null;
}

export function OwnerGatewaySection() {
  const { user, toast } = useStore();
  const [apiKey, setApiKey] = useState("");
  const [merchantId, setMerchantId] = useState("");
  const [username, setUsername] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState("");
  const [flipTarget, setFlipTarget] = useState<"demo" | "payteller" | null>(null);

  const { data: gw, err, loading, reload } = useOwnerFetch<GatewaySettingsShape>(
    user ? "/api/owner/gateway" : null,
  );

  const save = async (patch: Record<string, string>) => {
    setBusy(true);
    try {
      await api<GatewaySettingsShape>("/api/owner/gateway", { method: "POST", body: JSON.stringify(patch) });
      setApiKey("");
      setMerchantId("");
      setUsername("");
      setWebhookSecret("");
      toast("Gateway settings saved", "win");
      reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Save failed", "lose");
    } finally {
      setBusy(false);
    }
  };
  const saveKeys = () =>
    void save({
      paytellerApiKey: apiKey,
      paytellerMerchantId: merchantId,
      paytellerUsername: username,
      paytellerWebhookSecret: webhookSecret,
    });
  const flip = (g: "demo" | "payteller") => {
    if (!gw || g === gw.ghMomoGateway) return;
    if (g === "payteller" && !gw.paytellerConfigured) {
      toast("Save the 4 PayTeller keys first (or set them as env vars), then test the connection", "lose");
      return;
    }
    setFlipTarget(g);
  };
  const test = async () => {
    setTestBusy(true);
    setTestResult("");
    try {
      const r = await api<{ authenticated: boolean; merchant_id?: string; environment?: string }>("/api/owner/gateway/test", { method: "POST" });
      setTestResult(r.authenticated ? `Connected — ${r.merchant_id ?? ""} (${r.environment ?? ""})` : "PayTeller did not confirm these credentials.");
    } catch (ex) {
      setTestResult(ex instanceof Error ? ex.message : "Connection test failed");
    } finally {
      setTestBusy(false);
    }
  };
  if (loading) return <Skeleton lines={5} title />;
  if (err) return <ErrorState text={err} onRetry={reload} />;
  if (!gw) return null;
  return (
    <div>
      <p>
        <b>Ghana MoMo gateway</b>{" "}
        {gw.paytellerConfigured ? <Badge variant="ok">Keys saved</Badge> : <Badge variant="warn">No keys</Badge>}
      </p>
      <Segmented
        label="Ghana MoMo gateway"
        items={[
          { id: "demo", label: "Demo" },
          { id: "payteller", label: "PayTeller" },
        ]}
        value={gw.ghMomoGateway}
        onChange={(id) => flip(id as "demo" | "payteller")}
      />
      <Button variant="secondary" size="sm" loading={testBusy} onClick={() => void test()}>
        Test connection
      </Button>
      {testResult ? <p role="status">{testResult}</p> : null}
      <FormField label={`API key ${gw.paytellerApiKey ? `(${gw.paytellerApiKey})` : "(not set)"}`}>
        <Input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Paste new key to replace" aria-label="PayTeller API key" />
      </FormField>
      <FormField label={`Merchant ID ${gw.paytellerMerchantId ? `(${gw.paytellerMerchantId})` : "(not set)"}`}>
        <Input type="text" autoComplete="off" value={merchantId} onChange={(e) => setMerchantId(e.target.value)} placeholder="TTM-00000000" aria-label="PayTeller Merchant ID" />
      </FormField>
      <FormField label={`Username ${gw.paytellerUsername ? `(${gw.paytellerUsername})` : "(not set)"}`}>
        <Input type="text" autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="PayTeller username" aria-label="PayTeller username" />
      </FormField>
      <FormField label={`Webhook secret ${gw.paytellerWebhookSecret ? `(${gw.paytellerWebhookSecret})` : "(not set)"}`}>
        <Input type="password" autoComplete="off" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder="Paste new secret to replace" aria-label="PayTeller webhook secret" />
      </FormField>
      <Button variant="primary" size="sm" loading={busy} onClick={saveKeys}>
        Save keys
      </Button>
      <p>Webhook URL — register this in PayTeller Settings before the first payment:</p>
      <p>
        <code>{gw.webhookUrl}</code> <CopyButton text={gw.webhookUrl} label="Copy webhook URL" />
      </p>
      <ConfirmDialog
        open={flipTarget !== null}
        onClose={() => setFlipTarget(null)}
        onConfirm={() => {
          if (!flipTarget) return;
          setFlipTarget(null);
          return save({ ghMomoGateway: flipTarget });
        }}
        title="Switch Ghana MoMo gateway"
        body={
          flipTarget === "payteller"
            ? "New Ghana MoMo deposits will go through PayTeller's hosted checkout instead of the demo flow."
            : "New Ghana MoMo deposits will go through the demo flow instead of PayTeller."
        }
        facts={[
          { label: "Current", value: gw.ghMomoGateway === "payteller" ? "PayTeller" : "Demo" },
          { label: "New", value: flipTarget === "payteller" ? "PayTeller" : "Demo" },
        ]}
        confirmLabel={flipTarget === "payteller" ? "Switch to PayTeller" : "Switch to Demo"}
        busy={busy}
      />
    </div>
  );
}
