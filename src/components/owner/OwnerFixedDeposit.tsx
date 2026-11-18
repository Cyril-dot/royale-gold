// Fixed deposit amount (Nov 2026, owner feature) — the owner's
// per-fiat fixed deposit editor. When set for a fiat, EVERY deposit in
// that fiat must be exactly that amount (server-enforced in the demo
// cashier + PayTeller create; the DepositModal locks to it). Null =
// OFF (any amount >= min deposit). Set/clear both go behind a
// ConfirmDialog — it is a money-rule change — and are audit-logged
// server-side (action "deposit.fixed_amount").
// Reads from GET /api/owner/currency-config (which now carries
// fixedDepositAmount per currency); writes to POST /api/owner/fixed-deposit.
import { useState } from "react";
import { api } from "../../lib/api";
import { symbolFor } from "../../lib/country";
import type { CurrencyConfigShape } from "../../lib/game-config";
import { useStore } from "../../lib/store";
import { Badge } from "../staff-ui/Badge";
import { Button } from "../staff-ui/Button";
import { Card } from "../staff-ui/Card";
import { FormField, AmountInput } from "../staff-ui/Form";
import { ConfirmDialog } from "../staff-ui/Dialog";
import { Skeleton, ErrorState, EmptyState } from "../staff-ui/Feedback";
import { useOwnerFetch } from "./useOwnerFetch";

export function OwnerFixedDeposit() {
  const { user, toast } = useStore();
  const { data, err, loading, reload } = useOwnerFetch<{ currencies: CurrencyConfigShape[] }>(
    user ? "/api/owner/currency-config" : null,
  );
  const rows = data?.currencies ?? [];
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<{ currency: string; amount: number | null } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await api("/api/owner/fixed-deposit", {
        method: "POST",
        body: JSON.stringify({ currency: confirm.currency, amount: confirm.amount }),
      });
      toast(
        confirm.amount === null
          ? `${confirm.currency} fixed deposit cleared`
          : `${confirm.currency} fixed deposit set to ${symbolFor(confirm.currency)} ${confirm.amount.toFixed(2)}`,
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
        const fixed = row.fixedDepositAmount ?? null;
        const draftVal = draft[row.currency] ?? (fixed !== null ? String(fixed) : "");
        const parsed = Number(draftVal);
        const valid = draftVal.trim() !== "" && Number.isFinite(parsed) && parsed > 0;
        return (
          <Card key={row.currency} title={`${row.currency} (${row.symbol})`}>
            {fixed !== null ? (
              <Badge variant="info">Fixed at {symbolFor(row.currency)} {fixed.toFixed(2)}</Badge>
            ) : (
              <Badge variant="muted">Off — any amount</Badge>
            )}
            <p>
              {fixed !== null
                ? `Every ${row.currency} deposit must be exactly ${symbolFor(row.currency)} ${fixed.toFixed(2)}.`
                : `No fixed amount — deposits of any amount from ${symbolFor(row.currency)} ${row.minDeposit.toFixed(2)} up are allowed.`}
            </p>
            <FormField label={`Fixed deposit amount (${row.symbol}) — empty to clear`}>
              <AmountInput
                value={draftVal}
                onChange={(e) => setDraft((d) => ({ ...d, [row.currency]: e.target.value }))}
                aria-label={`${row.currency} fixed deposit amount`}
              />
            </FormField>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button
                variant="primary"
                size="sm"
                disabled={!valid || parsed === fixed}
                onClick={() => setConfirm({ currency: row.currency, amount: parsed })}
              >
                Set fixed amount
              </Button>
              {fixed !== null ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirm({ currency: row.currency, amount: null })}
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
        title={confirm?.amount === null ? "Clear the fixed deposit amount?" : "Set a fixed deposit amount?"}
        body={
          confirm?.amount === null
            ? `From now, ${confirm?.currency} deposits go back to any amount from the minimum up.`
            : `From now, every ${confirm?.currency} deposit must be exactly this amount — no other amount will be accepted.`
        }
        facts={
          confirm
            ? [
                { label: "Currency", value: confirm.currency },
                {
                  label: "Fixed amount",
                  value:
                    confirm.amount === null
                      ? "Off"
                      : `${symbolFor(confirm.currency)} ${confirm.amount.toFixed(2)}`,
                },
              ]
            : []
        }
        confirmLabel={confirm?.amount === null ? "Clear it" : "Set it"}
        danger={confirm?.amount !== null}
        busy={busy}
      />
    </div>
  );
}
