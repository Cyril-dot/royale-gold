// MaskedValue — masked by default (decision D1). Phase 3 wires Reveal to
// POST /api/owner/reveal: the caller passes onReveal (which calls the
// endpoint and returns the unmasked value) or controls the revealed
// state itself (revealedValue + onHide, for bundle reveals where one
// endpoint call unmasks several fields at once). Either way the audit
// entry is written server-side by the endpoint — this component never
// claims a log that wasn't made. Copy copies the MASKED value only,
// never the revealed one. With neither onReveal nor revealedValue the
// Reveal control stays disabled with a plain-language note (the demo).
"use client";

import { useState } from "react";
import { maskAccount, maskEmail, maskPhone } from "./format";
import { CopyButton } from "./CopyButton";

export type MaskKind = "account" | "phone" | "email";

function mask(value: string, kind: MaskKind): string {
  if (kind === "email") return maskEmail(value);
  if (kind === "phone") return maskPhone(value);
  return maskAccount(value);
}

export function MaskedValue({
  value,
  kind = "account",
  label,
  onReveal,
  revealedValue,
  onHide,
  hideReveal = false,
}: {
  value: string;
  kind?: MaskKind;
  /** Accessible label for the value, e.g. "MoMo number". */
  label?: string;
  /** Async reveal — calls the audited reveal endpoint, returns the
   *  unmasked value (or null when there is nothing to show). */
  onReveal?: () => Promise<string | null>;
  /** Parent-controlled revealed value (bundle reveal). When defined,
   *  the parent owns the state; onReveal is not used. */
  revealedValue?: string | null;
  onHide?: () => void;
  /** Owner preview is read-only: show the masked value with no Reveal
   *  control at all (the owner reveals through the owner kinds). */
  hideReveal?: boolean;
}) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const controlled = revealedValue !== undefined;
  const shown = controlled ? revealedValue : revealed;
  const masked = mask(value, kind);
  const reveal = async () => {
    if (!onReveal || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const v = await onReveal();
      if (v === null) setErr("Nothing saved to reveal.");
      else setRevealed(v);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Reveal failed.");
    } finally {
      setBusy(false);
    }
  };
  const hide = () => {
    if (controlled) onHide?.();
    else setRevealed(null);
  };
  return (
    <span className="st-masked">
      <span
        className="st-masked-value"
        aria-label={label ? `${label}${shown ? " (revealed)" : " (masked)"}` : shown ? "Revealed value" : "Masked value"}
      >
        {shown ?? masked}
      </span>
      <CopyButton text={masked} label="Copy masked" />
      {shown ? (
        <button type="button" className="st-copy-btn" onClick={hide}>
          Hide
        </button>
      ) : hideReveal ? null : onReveal ? (
        <button type="button" className="st-copy-btn" disabled={busy} onClick={() => void reveal()}>
          {busy ? "Revealing…" : "Reveal"}
        </button>
      ) : controlled ? null : (
        <>
          <button
            type="button"
            className="st-copy-btn"
            disabled
            title="Reveal needs the audited reveal endpoint"
            aria-disabled="true"
          >
            Reveal
          </button>
          <span className="st-masked-note">Reveal needs the audit endpoint (Phase 3)</span>
        </>
      )}
      {err ? (
        <span className="st-field-error" role="alert">
          {err}
        </span>
      ) : null}
    </span>
  );
}
