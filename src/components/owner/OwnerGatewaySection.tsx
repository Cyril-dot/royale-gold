import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useStore } from "../../lib/store";

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
  const { toast } = useStore();
  const [gw, setGw] = useState<GatewaySettingsShape | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [merchantId, setMerchantId] = useState("");
  const [username, setUsername] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState("");
  const load = useCallback(async () => {
    try {
      setGw(await api<GatewaySettingsShape>("/api/owner/gateway"));
    } catch { setGw(null); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const save = async (patch: Record<string, string>) => {
    setBusy(true);
    try {
      const r = await api<GatewaySettingsShape>("/api/owner/gateway", { method: "POST", body: JSON.stringify(patch) });
      setGw(r);
      setApiKey(""); setMerchantId(""); setUsername(""); setWebhookSecret("");
      toast("Gateway settings saved", "win");
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Save failed", "lose");
    } finally { setBusy(false); }
  };
  const saveKeys = () => void save({
    paytellerApiKey: apiKey,
    paytellerMerchantId: merchantId,
    paytellerUsername: username,
    paytellerWebhookSecret: webhookSecret,
  });
  const flip = (g: "demo" | "payteller") => {
    if (g === "payteller" && gw && !gw.paytellerConfigured) {
      toast("Save the 4 PayTeller keys first (or set them as env vars), then test the connection", "lose");
      return;
    }
    void save({ ghMomoGateway: g });
  };
  const test = async () => {
    setTestBusy(true);
    setTestResult("");
    try {
      const r = await api<{ authenticated: boolean; merchant_id?: string; environment?: string }>("/api/owner/gateway/test", { method: "POST" });
      setTestResult(r.authenticated ? `Connected — ${r.merchant_id ?? ""} (${r.environment ?? ""})` : "PayTeller did not confirm these credentials.");
    } catch (ex) {
      setTestResult(ex instanceof Error ? ex.message : "Connection test failed");
    } finally { setTestBusy(false); }
  };
  const copyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(gw?.webhookUrl ?? "");
      toast("Webhook URL copied", "win");
    } catch {
      toast("Copy failed — long-press the URL to copy it", "lose");
    }
  };
  if (gw === null) return <p>Loading gateway settings…</p>;
  return (
    <div className="ow-games">
      <div className="ow-game-row">
        <div className="ow-game-head">
          <b>Ghana MoMo gateway</b>
          {gw.paytellerConfigured
            ? <span className="ow-game-flag">KEYS SAVED</span>
            : <span className="ow-game-flag bad">NO KEYS</span>}
        </div>
        <div className="ow-game-toggles">
          <button type="button" className={`btn btn-sm ${gw.ghMomoGateway === "demo" ? "btn-gold" : "btn-ghost"}`} disabled={busy} onClick={() => flip("demo")} aria-pressed={gw.ghMomoGateway === "demo"}>Demo</button>
          <button type="button" className={`btn btn-sm ${gw.ghMomoGateway === "payteller" ? "btn-gold" : "btn-ghost"}`} disabled={busy} onClick={() => flip("payteller")} aria-pressed={gw.ghMomoGateway === "payteller"}>PayTeller</button>
          <button type="button" className="btn btn-sm btn-ghost" disabled={testBusy} onClick={() => void test()}>{testBusy ? "Testing…" : "Test connection"}</button>
        </div>
        {testResult && <p className="ow-game-note">{testResult}</p>}
        <div className="ow-game-econ">
          <label>API key {gw.paytellerApiKey ? `(${gw.paytellerApiKey})` : "(not set)"} <input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Paste new key to replace" aria-label="PayTeller API key" /></label>
          <label>Merchant ID {gw.paytellerMerchantId ? `(${gw.paytellerMerchantId})` : "(not set)"} <input type="text" autoComplete="off" value={merchantId} onChange={(e) => setMerchantId(e.target.value)} placeholder="TTM-00000000" aria-label="PayTeller Merchant ID" /></label>
          <label>Username {gw.paytellerUsername ? `(${gw.paytellerUsername})` : "(not set)"} <input type="text" autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="PayTeller username" aria-label="PayTeller username" /></label>
          <label>Webhook secret {gw.paytellerWebhookSecret ? `(${gw.paytellerWebhookSecret})` : "(not set)"} <input type="password" autoComplete="off" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder="Paste new secret to replace" aria-label="PayTeller webhook secret" /></label>
          <button className="btn btn-gold btn-sm" type="button" disabled={busy} onClick={saveKeys}>{busy ? "Saving…" : "Save keys"}</button>
        </div>
        <p className="ow-game-note">Webhook URL — register this in PayTeller Settings before the first payment:</p>
        <div className="ow-game-toggles">
          <code className="ow-gw-url">{gw.webhookUrl}</code>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => void copyWebhook()}>Copy</button>
        </div>
      </div>
    </div>
  );
}
