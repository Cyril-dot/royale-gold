// Owner Game row — per-game visibility + kill + economics, saved per row.
// Phase 4 restyle: staff-ui Card / Badge / Button / FormField / Input,
// per-game kill through the shared ConfirmDialog. Same behaviour as
// before: number inputs hold text locally so an empty field means
// "clear the override" (back to the catalogue default) instead of 0,
// Save sends only the fields that actually changed, and the kill
// endpoint records the change in the audit log (it takes no reason,
// so none is collected here).
"use client";

import { useState } from "react";
import { Card } from "../staff-ui/Card";
import { Button } from "../staff-ui/Button";
import { Badge } from "../staff-ui/Badge";
import { ConfirmDialog } from "../staff-ui/Dialog";
import { FormField, Input } from "../staff-ui/Form";

export function OwnerGameRow({ g, onSave }: {
  g: { slug: string; name: string; currency: string; visible: boolean; killed: boolean; minBet: number | null; maxBet: number | null; maxPayout: number | null; maxMultiplier: number; note: string; winChancePct: number | null; playGated: boolean };
  onSave: (slug: string, patch: Record<string, unknown>) => Promise<void>;
}) {
  const [minBet, setMinBet] = useState(g.minBet == null ? "" : String(g.minBet));
  const [maxBet, setMaxBet] = useState(g.maxBet == null ? "" : String(g.maxBet));
  const [maxPayout, setMaxPayout] = useState(g.maxPayout == null ? "" : String(g.maxPayout));
  const [maxMult, setMaxMult] = useState(String(g.maxMultiplier));
  // Win controls (Nov 2026): the per-game win chance — shown only for
  // server-drawn games (the server enforces it there and nowhere
  // else). Empty = clear the chance (back to today's behaviour).
  const [winChance, setWinChance] = useState(g.winChancePct == null ? "" : String(g.winChancePct));
  const [busy, setBusy] = useState(false);
  const [killConfirm, setKillConfirm] = useState(false);
  const unit = g.currency === "coins" ? "coins" : "GH₵";
  const numOrNull = (s: string): number | null => {
    const t = s.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
  };
  const save = async () => {
    const patch: Record<string, unknown> = {};
    const a = numOrNull(minBet);
    const b = numOrNull(maxBet);
    const c = numOrNull(maxPayout);
    const d = numOrNull(maxMult);
    if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c) || Number.isNaN(d)) return;
    if (a !== g.minBet) patch.minBet = a;
    if (b !== g.maxBet) patch.maxBet = b;
    if (c !== g.maxPayout) patch.maxPayout = c;
    if (d !== null && d !== g.maxMultiplier) patch.maxMultiplier = d;
    if (g.playGated) {
      const w = numOrNull(winChance);
      if (Number.isNaN(w)) return;
      if (w !== null && (w <= 0 || w > 100)) return;
      if (w !== g.winChancePct) patch.winChancePct = w;
    }
    if (Object.keys(patch).length === 0) return;
    setBusy(true);
    try { await onSave(g.slug, patch); } finally { setBusy(false); }
  };
  const kill = async () => {
    setKillConfirm(false);
    setBusy(true);
    try { await onSave(g.slug, { killed: true }); } finally { setBusy(false); }
  };
  const unkill = async () => {
    setBusy(true);
    try { await onSave(g.slug, { killed: false }); } finally { setBusy(false); }
  };
  return (
    <Card title={g.name} sub={g.note}>
      <div className="st-chip-row" role="group" aria-label={`${g.name} status`}>
        <Badge variant={g.currency === "coins" ? "info" : "muted"}>{g.currency === "coins" ? "Coins" : "Cash"}</Badge>
        <Badge variant="muted">max ×{g.maxMultiplier}</Badge>
        {g.killed ? <Badge variant="danger">Killed</Badge> : null}
        {!g.visible ? <Badge variant="warn">Hidden</Badge> : null}
      </div>
      <div className="st-chip-row" role="group" aria-label={`${g.name} visibility and kill switch`}>
        <Button
          variant={g.visible ? "secondary" : "ghost"}
          size="sm"
          disabled={busy}
          onClick={() => void onSave(g.slug, { visible: !g.visible })}
          aria-pressed={g.visible}
        >
          {g.visible ? "Visible" : "Hidden"}
        </Button>
        {g.killed ? (
          <Button variant="danger" size="sm" disabled={busy} onClick={() => void unkill()} aria-pressed={g.killed}>
            Killed — tap to resume
          </Button>
        ) : (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setKillConfirm(true)} aria-pressed={g.killed}>
            Kill switch
          </Button>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 12 }}>
        <FormField label={`Min bet (${unit})`}>
          <Input type="number" min={0} step={g.currency === "coins" ? 1 : 0.01} value={minBet} onChange={(e) => setMinBet(e.target.value)} placeholder="Default" aria-label={`${g.name} minimum bet`} />
        </FormField>
        <FormField label={`Max bet (${unit})`}>
          <Input type="number" min={0} step={g.currency === "coins" ? 1 : 0.01} value={maxBet} onChange={(e) => setMaxBet(e.target.value)} placeholder="No cap" aria-label={`${g.name} maximum bet`} />
        </FormField>
        <FormField label={`Max payout (${unit})`}>
          <Input type="number" min={0} step={g.currency === "coins" ? 1 : 0.01} value={maxPayout} onChange={(e) => setMaxPayout(e.target.value)} placeholder="No cap" aria-label={`${g.name} maximum payout`} />
        </FormField>
        <FormField label="Max ×">
          <Input type="number" min={0.01} step={0.01} value={maxMult} onChange={(e) => setMaxMult(e.target.value)} aria-label={`${g.name} maximum multiplier`} />
        </FormField>
        {g.playGated ? (
          <FormField label="Win chance (%)">
            <Input type="number" min={0.01} max={100} step={0.01} inputMode="decimal" value={winChance} onChange={(e) => setWinChance(e.target.value)} placeholder="Default" aria-label={`${g.name} win chance percent`} />
          </FormField>
        ) : null}
      </div>
      {g.playGated ? (
        <p>
          {g.winChancePct !== null
            ? `Win chance ${g.winChancePct}% — the base chance for this game; the LIVE factor still applies on top of it.`
            : "Win chance unset — this game plays at its natural chance, with the LIVE factor on top."}
        </p>
      ) : null}
      <Button variant="primary" size="sm" disabled={busy} loading={busy} onClick={() => void save()}>
        Save
      </Button>
      <ConfirmDialog
        open={killConfirm}
        onClose={() => setKillConfirm(false)}
        onConfirm={() => void kill()}
        title={`Kill ${g.name}`}
        body="No one can play this game until you unkill it. Other games are not affected."
        facts={[
          { label: "Game", value: g.name },
          { label: "Effect", value: "This game stops for every player" },
        ]}
        confirmLabel="Kill game"
        danger
        busy={busy}
      />
    </Card>
  );
}
