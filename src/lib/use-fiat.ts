// Phase 1 country-based (Nov 2026): the per-currency platform rules
// for the signed-in (or guest) viewer — conversion rate, min
// deposit/stake, decay step — from GET /api/games/config. The fetch
// is cached at module level, so every tile on a page shares one
// request. Before it resolves the GHS defaults apply (factor 1).
"use client";

import { useEffect, useState } from "react";
import { api } from "./api";

export interface FiatCfg {
  currency: string;
  symbol: string;
  minDeposit: number;
  minStake: number;
  conversionRate: number;
  decayStep: number;
  withdrawalOwnerThreshold: number;
  // Max withdrawal per request (Nov 2026, owner-set): null = no max.
  withdrawalMax: number | null;
}

let cache: Promise<FiatCfg[]> | null = null;

function loadCfgs(): Promise<FiatCfg[]> {
  if (!cache) {
    cache = api<{ currencies: FiatCfg[] }>("/api/games/config")
      .then((r) => r.currencies ?? [])
      .catch(() => []);
  }
  return cache;
}

/** GHS-term amounts scale by `factor` (conversionRate/5) into the
 * viewer's fiat — the same scaling the server uses for min/max stakes. */
export function useFiat(currency: string): {
  cfg: FiatCfg | null;
  factor: number;
  rate: number;
  minStake: number;
  minDeposit: number;
  decayStep: number;
  withdrawalMax: number | null;
} {
  const [cfg, setCfg] = useState<FiatCfg | null>(null);
  useEffect(() => {
    let live = true;
    void loadCfgs().then((rows) => {
      if (live) setCfg(rows.find((c) => c.currency === currency) ?? null);
    });
    return () => {
      live = false;
    };
  }, [currency]);
  const rate = cfg?.conversionRate ?? 5;
  return {
    cfg,
    factor: rate / 5,
    rate,
    minStake: cfg?.minStake ?? 1,
    minDeposit: cfg?.minDeposit ?? 1,
    decayStep: cfg?.decayStep ?? 100,
    withdrawalMax: cfg?.withdrawalMax ?? null,
  };
}
