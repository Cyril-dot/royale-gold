// Phase 1 country-based (Nov 2026): the currency filter chips for
// the admin + owner panels. GHS and NGN only — the two live fiats.
// Uses the global .fchip style (v48.css), so no new CSS is needed.
"use client";

import { symbolFor } from "../lib/country";

export const FIAT_OPTIONS = ["GHS", "NGN"] as const;

export default function CurrencyChips({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (currency: string) => void;
  label?: string;
}) {
  return (
    <div className="gp-filters" role="group" aria-label={label ?? "Currency"} style={{ padding: "0 0 12px", marginTop: 0 }}>
      {FIAT_OPTIONS.map((c) => (
        <button
          key={c}
          type="button"
          className="fchip"
          aria-pressed={value === c}
          onClick={() => onChange(c)}
        >
          {symbolFor(c)} {c}
        </button>
      ))}
    </div>
  );
}
