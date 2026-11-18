// OwnerRangeBar — the PRIME global date-range control + currency
// selector, shared by every owner route. The range drives every
// date-sensitive figure on the route below it; the fiat picks the one
// currency that route shows. Same behaviour as the old monolith's
// .ow-range + CurrencyChips, rebuilt on the staff-ui Segmented control.
"use client";

import { Segmented } from "../staff-ui/Tabs";
import CurrencyChips from "../CurrencyChips";
import { todayStr } from "../../lib/admin-client";
import { RANGE_PRESETS, fmtRangeDates, useOwner } from "./OwnerContext";

export function OwnerRangeBar() {
  const { fiat, setFiatSel, rangePreset, customFrom, customTo, range, pickPreset, setCustomFrom, setCustomTo } =
    useOwner();
  return (
    <div className="st-rangebar">
      <Segmented
        label="Date range"
        items={RANGE_PRESETS.map((p) => ({ id: p.id, label: p.label }))}
        value={rangePreset}
        onChange={(id) => pickPreset(id as (typeof RANGE_PRESETS)[number]["id"])}
      />
      {range ? <p className="st-rangebar-label">{fmtRangeDates(range)}</p> : null}
      {rangePreset === "custom" ? (
        <div className="st-rangebar-custom">
          <label>
            From{" "}
            <input className="st-input" type="date" value={customFrom} max={todayStr()} onChange={(e) => setCustomFrom(e.target.value)} aria-label="Custom range start" />
          </label>
          <label>
            To{" "}
            <input className="st-input" type="date" value={customTo} max={todayStr()} onChange={(e) => setCustomTo(e.target.value)} aria-label="Custom range end" />
          </label>
        </div>
      ) : null}
      <CurrencyChips value={fiat} onChange={(c) => setFiatSel(c)} label="Owner currency" />
    </div>
  );
}
