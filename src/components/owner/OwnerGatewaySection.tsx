// Phase 2 PayTeller (Nov 2026), Phase 3 restyle: the owner Gateway
// section — the 4 PayTeller fields (paste → encrypted, last-4 shown),
// the Ghana MoMo toggle (Demo / PayTeller), a Test connection button,
// and the webhook URL to register in PayTeller Settings. Blank fields
// keep the saved value; the toggle alone never needs the encryption
// key. Flipping the live gateway reroutes real money, so it goes
// through the shared ConfirmDialog; saving keys and testing do not.
// Nov 2026: Theteller direct MoMo push REMOVED (Chuks: PayTeller
// only) — the toggle is Demo / PayTeller and there is no Theteller
// card. A row still stamped "theteller" reads as PayTeller.
// Nov 2026 layout fix (Chuks: "scattered and arranged badly" on his
// phone): ONE gateway at a time — only the selected gateway's section
// renders, so the active gateway's keys are never buried under an
// inactive gateway's fields. The selector is the switcher. Demo gets
// one honest line instead of an empty gap. No logic changed: same
// state, same save/test/flip handlers, same confirm dialog.
// Nov 2026 Flutterwave v3 (Nigeria only): the same shape again for
// Nigeria — the 3 Flutterwave fields (public key, secret key, webhook
// secret hash) + the environment the keys belong to (test/live) +
// the Nigeria toggle (Demo / Flutterwave) + Test connection + the
// webhook URL to register in the Flutterwave dashboard. The two
// gateways are independent: Ghana stays PayTeller, Nigeria is
// Flutterwave, and neither save touches the other's fields.
// Nov 2026 AlphaPay (Ghana only, docs.alphapay.me): a third Ghana
// option — the direct MoMo push. The Ghana toggle is Demo /
// PayTeller / AlphaPay: 2 fields (secret key + webhook SIGNING
// secret, a separate secret from the API key) + the environment
// (test/live) + Test connection (calls GET /pricing/my-rates/) +
// the webhook URL to register in the AlphaPay dashboard. The
// environment is decided by the BASE URL called, not the key prefix
// — a sk_test_ key called on live processes real money, so the
// toggle matters.
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
// Nov 2026 Flutterwave v3 (Nigeria only): the same again for Nigeria
// — the 3 Flutterwave fields + the environment (test/live) + the
// Nigeria toggle (Demo / Flutterwave) + Test connection + the webhook
// URL to register in the Flutterwave dashboard.
interface GatewaySettingsShape {
  ghMomoGateway: "demo" | "payteller" | "alphapay";
  paytellerConfigured: boolean;
  paytellerApiKey: string | null;
  paytellerMerchantId: string | null;
  paytellerUsername: string | null;
  paytellerWebhookSecret: string | null;
  webhookUrl: string;
  // Nov 2026 AlphaPay (Ghana only, docs.alphapay.me): the direct
  // push — secret key + webhook SIGNING secret + environment.
  alphapayConfigured: boolean;
  alphapaySecretKey: string | null;
  alphapayWebhookSecret: string | null;
  alphapayEnvironment: string | null;
  alphapayWebhookUrl: string;
  ngGateway: "demo" | "flutterwave";
  flutterwaveConfigured: boolean;
  flutterwavePublicKey: string | null;
  flutterwaveSecretKey: string | null;
  flutterwaveWebhookSecret: string | null;
  flutterwaveEnvironment: string | null;
  flutterwaveWebhookUrl: string;
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
  const [flipTarget, setFlipTarget] = useState<"demo" | "payteller" | "alphapay" | null>(null);
  // Nov 2026 AlphaPay (Ghana only, docs.alphapay.me): the AlphaPay fields.
  const [apSecretKey, setApSecretKey] = useState("");
  const [apWebhookSecret, setApWebhookSecret] = useState("");
  // "" = unchanged (the saved environment shows until the owner picks
  // one); "test" | "live" once picked.
  const [apEnvironment, setApEnvironment] = useState("");
  const [apTestBusy, setApTestBusy] = useState(false);
  const [apTestResult, setApTestResult] = useState("");
  // Nov 2026 Flutterwave v3 (Nigeria only): the Nigeria fields.
  const [flwPublicKey, setFlwPublicKey] = useState("");
  const [flwSecretKey, setFlwSecretKey] = useState("");
  const [flwWebhookSecret, setFlwWebhookSecret] = useState("");
  // "" = unchanged (the saved environment shows until the owner picks
  // one); "test" | "live" once picked.
  const [flwEnvironment, setFlwEnvironment] = useState("");
  const [flwTestBusy, setFlwTestBusy] = useState(false);
  const [flwTestResult, setFlwTestResult] = useState("");
  const [flwFlipTarget, setFlwFlipTarget] = useState<"demo" | "flutterwave" | null>(null);

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
      setFlwPublicKey("");
      setFlwSecretKey("");
      setFlwWebhookSecret("");
      setFlwEnvironment("");
      setApSecretKey("");
      setApWebhookSecret("");
      setApEnvironment("");
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
  const flip = (g: "demo" | "payteller" | "alphapay") => {
    if (!gw || g === gw.ghMomoGateway) return;
    if (g === "payteller" && !gw.paytellerConfigured) {
      toast("Save the 4 PayTeller keys first (or set them as env vars), then test the connection", "lose");
      return;
    }
    // Nov 2026 AlphaPay (Ghana only): same flip guard — AlphaPay
    // needs its secret key + webhook signing secret saved first.
    if (g === "alphapay" && !gw.alphapayConfigured) {
      toast("Save the AlphaPay secret key and webhook signing secret first (or set them as env vars), then test the connection", "lose");
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
  // Nov 2026 AlphaPay (Ghana only, docs.alphapay.me): the AlphaPay handlers.
  const saveApKeys = () =>
    void save({
      alphapaySecretKey: apSecretKey,
      alphapayWebhookSecret: apWebhookSecret,
      alphapayEnvironment: apEnvironment,
    });
  const testAp = async () => {
    setApTestBusy(true);
    setApTestResult("");
    try {
      const r = await api<{ authenticated: boolean; ghanaNetworks?: string[]; ratesFound?: number }>("/api/owner/gateway/alphapay-test", { method: "POST" });
      setApTestResult(
        r.authenticated
          ? `Connected — AlphaPay accepted the secret key.${r.ghanaNetworks?.length ? ` Ghana networks: ${r.ghanaNetworks.join(", ")}.` : ""}`
          : "AlphaPay did not confirm these credentials.",
      );
    } catch (ex) {
      setApTestResult(ex instanceof Error ? ex.message : "Connection test failed");
    } finally {
      setApTestBusy(false);
    }
  };
  // Nov 2026 Flutterwave v3 (Nigeria only): the Nigeria handlers.
  const saveFlwKeys = () =>
    void save({
      flutterwavePublicKey: flwPublicKey,
      flutterwaveSecretKey: flwSecretKey,
      flutterwaveWebhookSecret: flwWebhookSecret,
      flutterwaveEnvironment: flwEnvironment,
    });
  const flipNg = (g: "demo" | "flutterwave") => {
    if (!gw || g === gw.ngGateway) return;
    if (g === "flutterwave" && !gw.flutterwaveConfigured) {
      toast("Save the 3 Flutterwave keys first (or set them as env vars), then test the connection", "lose");
      return;
    }
    setFlwFlipTarget(g);
  };
  const testFlw = async () => {
    setFlwTestBusy(true);
    setFlwTestResult("");
    try {
      const r = await api<{ authenticated: boolean }>("/api/owner/gateway/flutterwave-test", { method: "POST" });
      setFlwTestResult(r.authenticated ? "Connected — Flutterwave accepted the secret key." : "Flutterwave did not confirm these credentials.");
    } catch (ex) {
      setFlwTestResult(ex instanceof Error ? ex.message : "Connection test failed");
    } finally {
      setFlwTestBusy(false);
    }
  };
  if (loading) return <Skeleton lines={5} title />;
  if (err) return <ErrorState text={err} onRetry={reload} />;
  if (!gw) return null;
  const gatewayLabel = gw.ghMomoGateway === "payteller" ? "PayTeller" : gw.ghMomoGateway === "alphapay" ? "AlphaPay" : "Demo";
  const flipLabel = flipTarget === "payteller" ? "PayTeller" : flipTarget === "alphapay" ? "AlphaPay" : "Demo";
  const flipBody =
    flipTarget === "payteller"
      ? "New Ghana MoMo deposits will go through PayTeller's hosted checkout instead of the demo flow."
      : flipTarget === "alphapay"
        ? "New Ghana MoMo deposits will go through AlphaPay's direct push to the customer's phone instead of the demo flow."
        : "New Ghana MoMo deposits will go through the demo flow instead of a live gateway.";
  // Nov 2026 Flutterwave v3 (Nigeria only): the Nigeria flip dialog.
  const flwGatewayLabel = gw.ngGateway === "flutterwave" ? "Flutterwave" : "Demo";
  const flwFlipLabel = flwFlipTarget === "flutterwave" ? "Flutterwave" : "Demo";
  const flwFlipBody =
    flwFlipTarget === "flutterwave"
      ? "New Nigeria deposits will go through Flutterwave's hosted checkout instead of the demo flow."
      : "New Nigeria deposits will go through the demo flow instead of a live gateway.";
  const flwEnvValue = flwEnvironment || gw.flutterwaveEnvironment || "test";
  // Nov 2026 AlphaPay (Ghana only): the saved environment until the
  // owner picks one — same "" = unchanged shape as Flutterwave.
  const apEnvValue = apEnvironment || gw.alphapayEnvironment || "test";
  return (
    <>
    <div className="st-gw">
      <p className="st-gw-status">
        <b>Ghana MoMo gateway</b>{" "}
        {gw.ghMomoGateway === "payteller" ? (
          gw.paytellerConfigured ? (
            <Badge variant="ok">PayTeller keys saved</Badge>
          ) : (
            <Badge variant="warn">No keys</Badge>
          )
        ) : gw.ghMomoGateway === "alphapay" ? (
          gw.alphapayConfigured ? (
            <Badge variant="ok">AlphaPay keys saved</Badge>
          ) : (
            <Badge variant="warn">No keys</Badge>
          )
        ) : (
          <Badge variant="muted">Play money</Badge>
        )}
      </p>
      <Segmented
        label="Ghana MoMo gateway"
        items={[
          { id: "demo", label: "Demo" },
          { id: "payteller", label: "PayTeller" },
          { id: "alphapay", label: "AlphaPay" },
        ]}
        value={gw.ghMomoGateway}
        onChange={(id) => flip(id as "demo" | "payteller" | "alphapay")}
      />
      {gw.ghMomoGateway === "demo" ? (
        <div className="st-gw-section">
          <h3 className="st-gw-title">Demo (play money)</h3>
          <p className="st-gw-desc">Deposits credit instantly. No real payment, no keys needed.</p>
        </div>
      ) : gw.ghMomoGateway === "alphapay" ? (
        <div className="st-gw-section">
          <h3 className="st-gw-title">AlphaPay (direct MoMo push)</h3>
          <p className="st-gw-desc">The prompt goes straight to the customer&apos;s phone — MTN, Telecel or AirtelTigo. The customer pays exactly the deposit; AlphaPay&apos;s fee is on us. If AlphaPay answers with a hosted page instead, the customer is redirected to it.</p>
          <Button variant="secondary" size="sm" block loading={apTestBusy} onClick={() => void testAp()}>
            Test connection
          </Button>
          {apTestResult ? <p role="status">{apTestResult}</p> : null}
          <Segmented
            label="AlphaPay environment"
            items={[
              { id: "test", label: "Test" },
              { id: "live", label: "Live" },
            ]}
            value={apEnvValue}
            onChange={(id) => setApEnvironment(id as "test" | "live")}
          />
          <p className="st-gw-desc">The keys below belong to the {apEnvValue === "live" ? "live" : "test"} environment — test keys start sk_test_, live keys start sk_live_. The environment is decided by the base URL called, not the key prefix — a test key called on live processes real money.</p>
          <FormField label={`Secret key ${gw.alphapaySecretKey ? `(${gw.alphapaySecretKey})` : "(not set)"}`}>
            <Input type="password" autoComplete="off" value={apSecretKey} onChange={(e) => setApSecretKey(e.target.value)} placeholder="sk_live_... (or sk_test_...)" aria-label="AlphaPay secret key" />
          </FormField>
          <FormField label={`Webhook signing secret ${gw.alphapayWebhookSecret ? `(${gw.alphapayWebhookSecret})` : "(not set)"}`}>
            <Input type="password" autoComplete="off" value={apWebhookSecret} onChange={(e) => setApWebhookSecret(e.target.value)} placeholder="Signing secret shown once at webhook creation" aria-label="AlphaPay webhook signing secret" />
          </FormField>
          <Button variant="primary" size="sm" block loading={busy} onClick={saveApKeys}>
            Save keys
          </Button>
          <div className="st-gw-url">
            <p className="st-gw-url-label">Webhook URL — register this in the AlphaPay dashboard (Webhooks) before the first payment, and paste the signing secret back here.</p>
            <code className="st-gw-url-value">{gw.alphapayWebhookUrl}</code>
            <CopyButton text={gw.alphapayWebhookUrl} label="Copy webhook URL" />
          </div>
        </div>
      ) : (
        <div className="st-gw-section">
          <h3 className="st-gw-title">PayTeller (hosted checkout)</h3>
          <p className="st-gw-desc">The customer confirms and pays on PayTeller&apos;s checkout page.</p>
          <Button variant="secondary" size="sm" block loading={testBusy} onClick={() => void test()}>
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
          <Button variant="primary" size="sm" block loading={busy} onClick={saveKeys}>
            Save keys
          </Button>
          <div className="st-gw-url">
            <p className="st-gw-url-label">Webhook URL — register this in PayTeller Settings before the first payment.</p>
            <code className="st-gw-url-value">{gw.webhookUrl}</code>
            <CopyButton text={gw.webhookUrl} label="Copy webhook URL" />
          </div>
        </div>
      )}
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
    {/* Nov 2026 Flutterwave v3 (Nigeria only): the Nigeria gateway —
        the same one-at-a-time shape as Ghana, independent of it. */}
    <div className="st-gw">
      <p className="st-gw-status">
        <b>Nigeria gateway</b>{" "}
        {gw.ngGateway === "flutterwave" ? (
          gw.flutterwaveConfigured ? (
            <Badge variant="ok">Flutterwave keys saved</Badge>
          ) : (
            <Badge variant="warn">No keys</Badge>
          )
        ) : (
          <Badge variant="muted">Play money</Badge>
        )}
      </p>
      <Segmented
        label="Nigeria gateway"
        items={[
          { id: "demo", label: "Demo" },
          { id: "flutterwave", label: "Flutterwave" },
        ]}
        value={gw.ngGateway}
        onChange={(id) => flipNg(id as "demo" | "flutterwave")}
      />
      {gw.ngGateway === "demo" ? (
        <div className="st-gw-section">
          <h3 className="st-gw-title">Demo (play money)</h3>
          <p className="st-gw-desc">Deposits credit instantly. No real payment, no keys needed.</p>
        </div>
      ) : (
        <div className="st-gw-section">
          <h3 className="st-gw-title">Flutterwave (hosted checkout)</h3>
          <p className="st-gw-desc">The customer confirms and pays on Flutterwave&apos;s checkout page — card, bank transfer, USSD or bank account. The customer pays exactly the deposit; Flutterwave&apos;s fee is on us.</p>
          <Button variant="secondary" size="sm" block loading={flwTestBusy} onClick={() => void testFlw()}>
            Test connection
          </Button>
          {flwTestResult ? <p role="status">{flwTestResult}</p> : null}
          <Segmented
            label="Flutterwave environment"
            items={[
              { id: "test", label: "Test" },
              { id: "live", label: "Live" },
            ]}
            value={flwEnvValue}
            onChange={(id) => setFlwEnvironment(id as "test" | "live")}
          />
          <p className="st-gw-desc">The keys below belong to the {flwEnvValue === "live" ? "live" : "test"} environment — test keys start FLWSECK_TEST-, live keys start FLWSECK-.</p>
          <FormField label={`Public key ${gw.flutterwavePublicKey ? `(${gw.flutterwavePublicKey})` : "(not set)"}`}>
            <Input type="text" autoComplete="off" value={flwPublicKey} onChange={(e) => setFlwPublicKey(e.target.value)} placeholder="FLWPUBK-..." aria-label="Flutterwave public key" />
          </FormField>
          <FormField label={`Secret key ${gw.flutterwaveSecretKey ? `(${gw.flutterwaveSecretKey})` : "(not set)"}`}>
            <Input type="password" autoComplete="off" value={flwSecretKey} onChange={(e) => setFlwSecretKey(e.target.value)} placeholder="FLWSECK-... (or FLWSECK_TEST-...)" aria-label="Flutterwave secret key" />
          </FormField>
          <FormField label={`Webhook secret ${gw.flutterwaveWebhookSecret ? `(${gw.flutterwaveWebhookSecret})` : "(not set)"}`}>
            <Input type="password" autoComplete="off" value={flwWebhookSecret} onChange={(e) => setFlwWebhookSecret(e.target.value)} placeholder="Secret hash from Flutterwave Settings → Webhooks" aria-label="Flutterwave webhook secret" />
          </FormField>
          <Button variant="primary" size="sm" block loading={busy} onClick={saveFlwKeys}>
            Save keys
          </Button>
          <div className="st-gw-url">
            <p className="st-gw-url-label">Webhook URL — register this in Flutterwave Settings → Webhooks before the first payment, and paste the secret hash back here.</p>
            <code className="st-gw-url-value">{gw.flutterwaveWebhookUrl}</code>
            <CopyButton text={gw.flutterwaveWebhookUrl} label="Copy webhook URL" />
          </div>
        </div>
      )}
      <ConfirmDialog
        open={flwFlipTarget !== null}
        onClose={() => setFlwFlipTarget(null)}
        onConfirm={() => {
          if (!flwFlipTarget) return;
          setFlwFlipTarget(null);
          return save({ ngGateway: flwFlipTarget });
        }}
        title="Switch Nigeria gateway"
        body={flwFlipBody}
        facts={[
          { label: "Current", value: flwGatewayLabel },
          { label: "New", value: flwFlipLabel },
        ]}
        confirmLabel={`Switch to ${flwFlipLabel}`}
        busy={busy}
      />
    </div>
    </>
  );
}
