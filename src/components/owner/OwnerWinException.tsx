// Win controls (Nov 2026, owner feature) — the owner's per-fiat
// random win exception chance editor. When set for a fiat, that
// percent of cash wins bypass the win-allowance cap entirely (full
// natural profit credited, allowance untouched for that win). The roll
// is server-side (Node crypto, inside the settle transaction) and the
// player never sees it — no label, no announcement; a bypassed win
// simply shows its full credited amount. Null = OFF (the cap always
// applies). Set/clear both go behind a ConfirmDialog — it is a
// money-rule change — and are audit-logged server-side (action
// "win.exception").
// Reads from GET /api/owner/currency-config (which now carries
// winExceptionPct per currency); writes to POST /api/owner/win-exception.
import { useState } from "react";
import { api } from "../../lib/api";
import type { CurrencyConfigShape } from "../../lib/game-config";
import { useStore } from "../../lib/store";
import { Badge } from "../staff-ui/Badge";
import { Button } from "../staff-ui/Button";
import { Card } from "../staff-ui/Card";
import { FormField, Input } from "../staff-ui/Form";
import { ConfirmDialog } from "../staff-ui/Dialog";
import { Skeleton, ErrorState, EmptyState } from "../staff-ui/Feedback";
import { useOwnerFetch } from "./useOwnerFetch";

export function OwnerWinException() {
  const { user, toast } = useStore();
  const { data, err, loading, reload } = useOwnerFetch<{ currencies: CurrencyConfigShape[] }>(
    user ? "/api/owner/currency-config" : null,
  );
  const rows = data?.currencies ?? [];
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<{ currency: string; chancePct: number | null } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await api("/api/owner/win-exception", {
        method: "POST",
        body: JSON.stringify({ currency: confirm.currency, chancePct: confirm.chancePct }),
      });
      toast(
        confirm.chancePct === null
          ? `${confirm.currency} win exception cleared — the win cap always applies`
          : `${confirm.currency} win exception set to ${confirm.chancePct}%`,
        "win",
      );
      setDraft((cur) => {
        const next = { ...cur };
        delete next[confirm.currency];
        return next;
      });
      setConfirm(null);
      reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Save failed", "lose");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Skeleton lines={4} title />;
  if (err) return <ErrorState text={err} onRetry={reload} />;
  if (rows.length === 0) return <EmptyState title="No currency settings yet." text="No currency settings yet." />;
  return (
    <div>
      {rows.map((row) => {
        const chance = row.winExceptionPct ?? null;
        const draftVal = draft[row.currency] ?? (chance !== null ? String(chance) : "");
        const parsed = Number(draftVal);
        const valid = draftVal.trim() !== "" && Number.isFinite(parsed) && parsed > 0 && parsed <= 100;
        return (
          <Card key={row.currency} title={`${row.currency} (${row.symbol})`}>
            {chance !== null ? (
              <Badge variant="info">Exception chance {chance}%</Badge>
            ) : (
              <Badge variant="muted">Off — the win cap always applies</Badge>
            )}
            <p>
              {chance !== null
                ? `About ${chance} in 100 ${row.currency} wins bypass the win cap — the full amount is paid and the allowance is not used up.`
                : `No exception — every ${row.currency} win is capped by the win rate above.`}
            </p>
            <FormField label="Exception chance (%) — empty to clear">
              <Input
                type="number"
                min={0.01}
                max={100}
                step={0.01}
                inputMode="decimal"
                value={draftVal}
                onChange={(e) => setDraft((d) => ({ ...d, [row.currency]: e.target.value }))}
                aria-label={`${row.currency} win exception chance percent`}
              />
            </FormField>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button
                variant="primary"
                size="sm"
                disabled={!valid || parsed === chance}
                onClick={() => setConfirm({ currency: row.currency, chancePct: parsed })}
              >
                Set exception chance
              </Button>
              {chance !== null ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirm({ currency: row.currency, chancePct: null })}
                >
                  Clear (turn off)
                </Button>
              ) : null}
            </div>
          </Card>
        );
      })}
      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => void save()}
        title={confirm?.chancePct === null ? "Clear the exception chance?" : "Set an exception chance?"}
        body={
          confirm?.chancePct === null
            ? `From now, every ${confirm?.currency} win is capped by the win rate again — no win bypasses it.`
            : `From now, about ${confirm?.chancePct} in 100 ${confirm?.currency} wins bypass the win cap entirely — the full amount is paid and the allowance is not used up. Players see nothing different.`
        }
        facts={
          confirm
            ? [
                { label: "Currency", value: confirm.currency },
                { label: "Exception chance", value: confirm.chancePct === null ? "Off" : `${confirm.chancePct}%` },
              ]
            : []
        }
        confirmLabel={confirm?.chancePct === null ? "Clear it" : "Set it"}
        danger={confirm?.chancePct !== null}
        busy={busy}
      />
    </div>
  );
}
