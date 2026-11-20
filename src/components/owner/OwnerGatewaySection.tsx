// Phase 2 PayTeller (Nov 2026), Phase 3 restyle: the owner Gateway
// section — the 4 PayTeller fields (paste → encrypted, last-4 shown),
// the Ghana MoMo toggle (Demo / Theteller / PayTeller), a Test
// connection button, and the webhook URL to register in PayTeller
// Settings. Blank fields keep the saved value; the toggle alone never
// needs the encryption key. Flipping the live gateway reroutes real
// money, so it goes through the shared ConfirmDialog; saving keys and
// testing do not.
// Nov 2026 Theteller (PaySwitch): the same treatment for the
// Theteller direct-push fields (API user, API key, Merchant ID,
// callback secret, base URL Test/Live) + its own Test connection
// button and the callback URL. Theteller is the direct MoMo push
// path (prompt straight to the phone, no checkout page); PayTeller
// stays as the hosted-checkout choice.
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
// toggle (Demo / Theteller / PayTeller), a Test connection button,
// and the webhook URL to register in PayTeller Settings. Blank fields
// keep the saved value; the toggle alone never needs the encryption
// key.
// Nov 2026 Theteller: the same for the direct-push fields.
interface GatewaySettingsShape {
  ghMomoGateway: "demo" | "payteller" | "theteller";
  paytellerConfigured: boolean;
  paytellerApiKey: string | null;
  paytellerMerchantId: string | null;
  paytellerUsername: string | null;
  paytellerWebhookSecret: string | null;
  thetellerConfigured: boolean;
  thetellerApiUser: string | null;
  thetellerApiKey: string | null;
  thetellerMerchantId: string | null;
  thetellerCallbackSecret: string | null;
  thetellerBaseUrl: string | null;
  webhookUrl: string;
  thetellerCallbackUrl: string;
  updatedAt: string | null;
}

export function OwnerGatewaySection() {
  const { user, toast } = useStore();
  const [apiKey, setApiKey] = useState("");
  const [merchantId, setMerchantId] = useState("");
  const [username, setUsername] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [tApiUser, setTApiUser] = useState("");
  const [tApiKey, setTApiKey] = useState("");
  const [tMerchantId, setTMerchantId] = useState("");
  const [tCallbackSecret, setTCallbackSecret] = useState("");
  // Theteller environment: local until saved with the keys (an
  // immediate save on tap would wipe typed-but-unsaved key fields).
  const [tEnv, setTEnv] = useState<"test" | "live" | null>(null);
  const [busy, setBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState("");
  const [tTestBusy, setTTestBusy] = useState(false);
  const [tTestResult, setTTestResult] = useState("");
  const [flipTarget, setFlipTarget] = useState<"demo" | "payteller" | "theteller" | null>(null);

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
      setTApiUser("");
      setTApiKey("");
      setTMerchantId("");
      setTCallbackSecret("");
      setTEnv(null);
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
  const saveThetellerKeys = () =>
    void save({
      thetellerApiUser: tApiUser,
      thetellerApiKey: tApiKey,
      thetellerMerchantId: tMerchantId,
      thetellerCallbackSecret: tCallbackSecret,
      thetellerBaseUrl: tEnv ?? (gw?.thetellerBaseUrl === "https://prod.theteller.net" ? "live" : "test"),
    });
  const flip = (g: "demo" | "payteller" | "theteller") => {
    if (!gw || g === gw.ghMomoGateway) return;
    if (g === "payteller" && !gw.paytellerConfigured) {
      toast("Save the 4 PayTeller keys first (or set them as env vars), then test the connection", "lose");
      return;
    }
    if (g === "theteller" && !gw.thetellerConfigured) {
      toast("Save the Theteller API user, key and Merchant ID first (or set them as env vars), then test the connection", "lose");
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
  const testTheteller = async () => {
    setTTestBusy(true);
    setTTestResult("");
    try {
      const r = await api<{ authenticated: boolean; code?: string | null; reason?: string | null }>("/api/owner/gateway/theteller-test", { method: "POST" });
      setTTestResult(r.authenticated ? "Connected — Theteller answered with these credentials." : "Theteller did not confirm these credentials.");
    } catch (ex) {
      setTTestResult(ex instanceof Error ? ex.message : "Connection test failed");
    } finally {
      setTTestBusy(false);
    }
  };
  if (loading) return <Skeleton lines={5} title />;
  if (err) return <ErrorState text={err} onRetry={reload} />;
  if (!gw) return null;
  const gatewayLabel = gw.ghMomoGateway === "payteller" ? "PayTeller" : gw.ghMomoGateway === "theteller" ? "Theteller" : "Demo";
  const flipLabel = flipTarget === "payteller" ? "PayTeller" : flipTarget === "theteller" ? "Theteller" : "Demo";
  const flipBody =
    flipTarget === "payteller"
      ? "New Ghana MoMo deposits will go through PayTeller's hosted checkout instead of the demo flow."
      : flipTarget === "theteller"
        ? "New Ghana MoMo deposits will go through Theteller direct MoMo push — the prompt goes straight to the customer's phone, no checkout page."
        : "New Ghana MoMo deposits will go through the demo flow instead of a live gateway.";
  return (
    <div>
      <p>
        <b>Ghana MoMo gateway</b>{" "}
        {gw.thetellerConfigured ? <Badge variant="ok">Theteller keys saved</Badge> : null}{" "}
        {gw.paytellerConfigured ? <Badge variant="ok">PayTeller keys saved</Badge> : <Badge variant="warn">No keys</Badge>}
      </p>
      <Segmented
        label="Ghana MoMo gateway"
        items={[
          { id: "demo", label: "Demo" },
          { id: "theteller", label: "Theteller" },
          { id: "payteller", label: "PayTeller" },
        ]}
        value={gw.ghMomoGateway}
        onChange={(id) => flip(id as "demo" | "payteller" | "theteller")}
      />
      <p>Theteller is the direct MoMo push path. PayTeller stays as the hosted-checkout choice.</p>
      <h3>Theteller (direct MoMo push)</h3>
      <Segmented
        label="Theteller environment"
        items={[
          { id: "test", label: "Test" },
          { id: "live", label: "Live" },
        ]}
        value={tEnv ?? (gw.thetellerBaseUrl === "https://prod.theteller.net" ? "live" : "test")}
        onChange={(id) => setTEnv(id as "test" | "live")}
      />
      <Button variant="secondary" size="sm" loading={tTestBusy} onClick={() => void testTheteller()}>
        Test Theteller connection
      </Button>
      {tTestResult ? <p role="status">{tTestResult}</p> : null}
      <FormField label={`API user ${gw.thetellerApiUser ? `(${gw.thetellerApiUser})` : "(not set)"}`}>
        <Input type="text" autoComplete="off" value={tApiUser} onChange={(e) => setTApiUser(e.target.value)} placeholder="Theteller API username" aria-label="Theteller API user" />
      </FormField>
      <FormField label={`API key ${gw.thetellerApiKey ? `(${gw.thetellerApiKey})` : "(not set)"}`}>
        <Input type="password" autoComplete="off" value={tApiKey} onChange={(e) => setTApiKey(e.target.value)} placeholder="Paste new key to replace" aria-label="Theteller API key" />
      </FormField>
      <FormField label={`Merchant ID ${gw.thetellerMerchantId ? `(${gw.thetellerMerchantId})` : "(not set)"}`}>
        <Input type="text" autoComplete="off" value={tMerchantId} onChange={(e) => setTMerchantId(e.target.value)} placeholder="TTM-00000000" aria-label="Theteller Merchant ID" />
      </FormField>
      <FormField label={`Callback secret ${gw.thetellerCallbackSecret ? `(${gw.thetellerCallbackSecret})` : "(not set)"}`}>
        <Input type="password" autoComplete="off" value={tCallbackSecret} onChange={(e) => setTCallbackSecret(e.target.value)} placeholder="Paste new secret to replace" aria-label="Theteller callback secret" />
      </FormField>
      <Button variant="primary" size="sm" loading={busy} onClick={saveThetellerKeys}>
        Save Theteller keys
      </Button>
      <p>Callback URL — register this with PaySwitch if your account supports a notification URL for direct payments (the docs do not say how it is configured — confirm with PaySwitch). Replace &lt;secret&gt; with the callback secret above:</p>
      <p>
        <code>{gw.thetellerCallbackUrl}</code> <CopyButton text={gw.thetellerCallbackUrl} label="Copy Theteller callback URL" />
      </p>
      <h3>PayTeller (hosted checkout)</h3>
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
        body={flipBody}
        facts={[
          { label: "Current", value: gatewayLabel },
          { label: "New", value: flipLabel },
        ]}
        confirmLabel={`Switch to ${flipLabel}`}
        busy={busy}
      />
    </div>
  );
}
