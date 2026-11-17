// MaskedValue — masked by default (decision D1).
//
// Phase 1 honesty rule: there is NO reveal endpoint yet (§7.2 item 3
// lands in Phase 3), so the Reveal control is present in the API but
// DISABLED with a plain-language note — it never shows an unmasked value
// from nowhere and never claims an audit entry was written. Copy copies
// the MASKED value only.
"use client";

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
}: {
  value: string;
  kind?: MaskKind;
  /** Accessible label for the value, e.g. "MoMo number". */
  label?: string;
}) {
  const masked = mask(value, kind);
  return (
    <span className="st-masked">
      <span className="st-masked-value" aria-label={label ? `${label} (masked)` : "Masked value"}>
        {masked}
      </span>
      <CopyButton text={masked} label="Copy masked" />
      <button
        type="button"
        className="st-copy-btn"
        disabled
        title="Reveal needs the audited reveal endpoint — lands in Phase 3"
        aria-disabled="true"
      >
        Reveal
      </button>
      <span className="st-masked-note">Reveal needs the audit endpoint (Phase 3)</span>
    </span>
  );
}
