// Win rate (Nov 2026, owner feature) — the owner's per-fiat win rate
// editor. When set for a fiat, a deposit of D in that fiat can win at
// most D x rate% in total across all games (server-enforced in
// settleGame; players never see it — no max-win labels anywhere
// player-facing). Null = OFF (winnings uncapped). Set/clear both go
// behind a ConfirmDialog — it is a money-rule change — and are
// audit-logged server-side (action "win.rate").
// Reads from GET /api/owner/currency-config (which now carries
// winRatePct per currency); writes to POST /api/owner/win-rate.
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

export function OwnerWinRate() {
  const { user, toast } = useStore();
  const { data, err, loading, reload } = useOwnerFetch<{ currencies: CurrencyConfigShape[] }>(
    user ? "/api/owner/currency-config" : null,
  );
  const rows = data?.currencies ?? [];
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<{ currency: string; ratePct: number | null } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await api("/api/owner/win-rate", {
        method: "POST",
        body: JSON.stringify({ currency: confirm.currency, ratePct: confirm.ratePct }),
      });
      toast(
        confirm.ratePct === null
          ? `${confirm.currency} win rate cleared — winnings uncapped`
          : `${confirm.currency} win rate set to ${confirm.ratePct}%`,
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
        const rate = row.winRatePct ?? null;
        const draftVal = draft[row.currency] ?? (rate !== null ? String(rate) : "");
        const parsed = Number(draftVal);
        const valid = draftVal.trim() !== "" && Number.isFinite(parsed) && parsed > 0 && parsed <= 100;
        return (
          <Card key={row.currency} title={`${row.currency} (${row.symbol})`}>
            {rate !== null ? (
              <Badge variant="info">Win rate {rate}%</Badge>
            ) : (
              <Badge variant="muted">Off — winnings uncapped</Badge>
            )}
            <p>
              {rate !== null
                ? `A ${row.currency} deposit can win at most ${rate}% of itself in total, across all games.`
                : `No win rate — game winnings are uncapped for ${row.currency}.`}
            </p>
            <FormField label="Win rate (%) — empty to clear">
              <Input
                type="number"
                min={0.01}
                max={100}
                step={0.01}
                inputMode="decimal"
                value={draftVal}
                onChange={(e) => setDraft((d) => ({ ...d, [row.currency]: e.target.value }))}
                aria-label={`${row.currency} win rate percent`}
              />
            </FormField>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button
                variant="primary"
                size="sm"
                disabled={!valid || parsed === rate}
                onClick={() => setConfirm({ currency: row.currency, ratePct: parsed })}
              >
                Set win rate
              </Button>
              {rate !== null ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirm({ currency: row.currency, ratePct: null })}
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
        title={confirm?.ratePct === null ? "Clear the win rate?" : "Set a win rate?"}
        body={
          confirm?.ratePct === null
            ? `From now, ${confirm?.currency} game winnings go back to uncapped.`
            : `From now, a ${confirm?.currency} deposit can win at most ${confirm?.ratePct}% of itself in total, across all games. A player who has won that much from a deposit wins nothing more until they deposit again.`
        }
        facts={
          confirm
            ? [
                { label: "Currency", value: confirm.currency },
                { label: "Win rate", value: confirm.ratePct === null ? "Off" : `${confirm.ratePct}%` },
              ]
            : []
        }
        confirmLabel={confirm?.ratePct === null ? "Clear it" : "Set it"}
        danger={confirm?.ratePct !== null}
        busy={busy}
      />
    </div>
  );
}
