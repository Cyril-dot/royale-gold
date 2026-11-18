// OwnerContext — the shared state the owner routes need, lifted out of
// the old monolith (src/app/owner/page.tsx, Phase 2 split).
//
// What lives here: the fiat selector and the PRIME global date-range
// (preset + custom + resolved [from, to], UTC days — D2 kept), and the
// admins list with its loader. Everything else (per-section data) loads
// in its own route component — this context makes NO per-section API
// calls, so opening a route fetches only what that route needs.
// Range resolution runs in an effect, never during render (the old
// page's rule — useState initializers must never call Date.now()).
"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../../lib/api";
import { useStore } from "../../lib/store";
import { todayStr } from "../../lib/admin-client";
import { RANGE_PRESETS, fmtRangeDates, rangeForPreset, addDaysStr, type RangePreset } from "./owner-helpers";
import type { AdminRow } from "./owner-types";

export { RANGE_PRESETS, fmtRangeDates, addDaysStr };
export type { RangePreset };

interface OwnerContextValue {
  /** One fiat at a time; defaults to the owner's own currency. */
  fiat: string;
  setFiatSel: (c: string | null) => void;
  rangePreset: RangePreset;
  customFrom: string;
  customTo: string;
  /** Resolved UTC [from, to] (inclusive), or null before the first effect. */
  range: { from: string; to: string } | null;
  pickPreset: (p: RangePreset) => void;
  setCustomFrom: (s: string) => void;
  setCustomTo: (s: string) => void;
  /** Today's UTC date string (YYYY-MM-DD). */
  today: string;
  /** All admins (owner-only). Null until loaded; load lazily — routes
   *  that need the list call loadAdmins() themselves. */
  admins: AdminRow[] | null;
  adminsErr: boolean;
  loadAdmins: () => Promise<void>;
}

const Ctx = createContext<OwnerContextValue | null>(null);

export function OwnerProvider({ children }: { children: ReactNode }) {
  const { user } = useStore();
  const [fiatSel, setFiatSel] = useState<string | null>(null);
  const fiat = fiatSel ?? user?.currency ?? "GHS";

  const [rangePreset, setRangePreset] = useState<RangePreset>("7d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  useEffect(() => {
    setRange(rangeForPreset(rangePreset, todayStr(), customFrom, customTo));
  }, [rangePreset, customFrom, customTo]);
  const pickPreset = (p: RangePreset) => {
    setRangePreset(p);
    if (p === "custom") {
      const t = todayStr();
      setCustomFrom((cur) => cur || addDaysStr(t, -6));
      setCustomTo((cur) => cur || t);
    }
  };

  const [today, setToday] = useState("");
  useEffect(() => {
    setToday(todayStr());
  }, []);

  const [admins, setAdmins] = useState<AdminRow[] | null>(null);
  const [adminsErr, setAdminsErr] = useState(false);
  const loadAdmins = useCallback(async () => {
    try {
      const a = await api<{ admins: AdminRow[] }>("/api/owner/admins");
      setAdmins(a.admins);
      setAdminsErr(false);
    } catch {
      setAdminsErr(true);
    }
  }, []);

  return (
    <Ctx.Provider
      value={{
        fiat,
        setFiatSel,
        rangePreset,
        customFrom,
        customTo,
        range,
        pickPreset,
        setCustomFrom,
        setCustomTo,
        today,
        admins,
        adminsErr,
        loadAdmins,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useOwner(): OwnerContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOwner must be used inside <OwnerProvider>");
  return ctx;
}
