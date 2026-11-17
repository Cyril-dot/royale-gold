// CoinConverter (round 16) — convert REAL cash to coins at the
// per-currency rate from /api/games/config (GHS 5 = 1 coin, NGN 500 =
// 1 coin seed). One-way only, REAL cash only, SIM never touched.
// The 3D tilt card follows the WalletCard pattern: pointer tilt on
// hover-capable pointers, a gentle float on touch, nothing moves under
// prefers-reduced-motion. The gold coin idles in a slow spin and does
// three fast turns on a successful convert; the coin total counts up
// to its new value.

"use client";

import { useEffect, useRef, useState } from "react";
import { api, fmtMoney } from "../lib/api";
import { symbolFor } from "../lib/country";
import { useStore } from "../lib/store";

// Phase 1 country-based (Nov 2026): the rate + chips come from the
// player's currency config (fetched below); these are the GHS
// fallbacks used before the config loads.
const FALLBACK_RATE = 5;
const CHIP_MULTS = [1, 2, 5, 10, 20];
const DEFAULT_MULT = 10;

/** "50" not "50.00" — the preview reads GH₵50 → 10 coins. */
const fmtAmt = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");

interface CurrencyCfg {
  currency: string;
  symbol: string;
  conversionRate: number;
}

export default function CoinConverter() {
  const { user, wallet, mode, setMode, setWallet, toast, setDepositOpen } = useStore();
  const [rate, setRate] = useState(FALLBACK_RATE);
  const [text, setText] = useState(String(FALLBACK_RATE * DEFAULT_MULT));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [spinKey, setSpinKey] = useState(0);
  const [justConverted, setJustConverted] = useState<{ gained: number; debited: number } | null>(null);
  const [displayCoins, setDisplayCoins] = useState(0);
  const [countFrom, setCountFrom] = useState<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fiat = user?.currency ?? wallet?.currency ?? "GHS";
  const sym = symbolFor(fiat);
  const chips = CHIP_MULTS.map((m) => m * rate);

  // Phase 1 country-based (Nov 2026): the conversion rate is the
  // player's currency config, not a hardcoded 5.
  useEffect(() => {
    let cancelled = false;
    api<{ currencies: CurrencyCfg[] }>("/api/games/config")
      .then((r) => {
        if (cancelled) return;
        const row = r.currencies?.find((c) => c.currency === fiat);
        if (row && row.conversionRate > 0) {
          setRate(row.conversionRate);
          setText((prev) => {
            const n = Number.parseFloat(prev);
            // Re-base the typed amount when the rate loads (e.g. a GHS
            // default of 50 becomes the NGN default of 5,000).
            if (!Number.isFinite(n) || n <= 0) return String(row.conversionRate * DEFAULT_MULT);
            return prev;
          });
        }
      })
      .catch(() => { /* GHS fallback stays */ });
    return () => { cancelled = true; };
  }, [fiat]);

  const cash = wallet?.cash ?? user?.cash ?? 0;
  const coins = wallet?.coins ?? user?.coins ?? 0;
  const amount = Number.parseFloat(text);
  const parsed = Number.isFinite(amount) ? amount : 0;
  const previewCoins = Math.floor(parsed / rate);
  const insufficient = mode === "REAL" && parsed >= rate && parsed > cash;
  const canConvert = mode === "REAL" && parsed >= rate && !insufficient && !busy;

  // Coin total counts up to its new value after a convert (instant when
  // reduced motion is on, or when the balance changes for any other reason).
  useEffect(() => {
    if (countFrom === null) {
      setDisplayCoins(coins);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplayCoins(coins);
      setCountFrom(null);
      return;
    }
    const start = countFrom;
    const end = coins;
    const t0 = performance.now();
    const dur = 700;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setDisplayCoins(Math.round(start + (end - start) * e));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setCountFrom(null);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [countFrom, coins]);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      if (spinTimer.current) clearTimeout(spinTimer.current);
    },
    []
  );

  // 3D tilt — same pattern as WalletCard: hover-capable pointers only,
  // gentle return on leave, nothing under prefers-reduced-motion.
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !window.matchMedia("(hover: hover)").matches) return;
    let leaveTimer: ReturnType<typeof setTimeout> | null = null;
    card.style.transition = "transform .18s ease-out";
    const onMove = (e: PointerEvent) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `rotateY(${(x * 8).toFixed(2)}deg) rotateX(${(-y * 8).toFixed(2)}deg)`;
      card.style.setProperty("--mx", `${((x + 0.5) * 100).toFixed(1)}%`);
      card.style.setProperty("--my", `${((y + 0.5) * 100).toFixed(1)}%`);
      card.style.setProperty("--shx", `${(-x * 14).toFixed(1)}px`);
      card.style.setProperty("--shy", `${(18 - y * 10).toFixed(1)}px`);
    };
    const onLeave = () => {
      card.style.transition = "transform .55s cubic-bezier(.2,.8,.3,1)";
      card.style.transform = "";
      card.style.setProperty("--mx", "50%");
      card.style.setProperty("--my", "40%");
      card.style.setProperty("--shx", "0px");
      card.style.setProperty("--shy", "18px");
      leaveTimer = setTimeout(() => {
        card.style.transition = "transform .18s ease-out";
      }, 560);
    };
    card.addEventListener("pointermove", onMove);
    card.addEventListener("pointerleave", onLeave);
    return () => {
      if (leaveTimer) clearTimeout(leaveTimer);
      card.removeEventListener("pointermove", onMove);
      card.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  const onBlurSnap = () => {
    // Snap DOWN to the nearest multiple of the rate, minimum the rate.
    if (!Number.isFinite(parsed) || parsed < rate) {
      setText(String(rate));
    } else {
      setText(String(Math.floor(parsed / rate) * rate));
    }
  };

  const convert = async () => {
    if (!canConvert) return;
    setBusy(true);
    setError(null);
    const fromCoins = coins;
    try {
      const r = await api<{ cash: number; coins: number; sim: number; coinsGained: number; cashDebited: number; fiatCurrency: string; rate: number }>(
        "/api/wallet/convert",
        { method: "POST", body: JSON.stringify({ cashAmount: parsed }) }
      );
      setWallet({ cash: r.cash, coins: r.coins, sim: r.sim, currency: r.fiatCurrency ?? fiat, country: user?.country ?? wallet?.country ?? "GH" });
      setCountFrom(fromCoins);
      setSpinKey((k) => k + 1);
      setSpinning(true);
      setJustConverted({ gained: r.coinsGained, debited: r.cashDebited });
      toast(`Converted ${sym}${fmtAmt(r.cashDebited)} → ${r.coinsGained} coins`, "win");
      if (spinTimer.current) clearTimeout(spinTimer.current);
      spinTimer.current = setTimeout(() => setSpinning(false), 950);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setJustConverted(null), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conversion failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="cv-wrap" aria-label="Convert cash to coins">
      <div className="cv-card" ref={cardRef}>
        <div className="cv-head">
          <div>
            <h3>Convert cash to coins</h3>
            <p className="cv-sub">Turn your cash into coins to play the coin games.</p>
          </div>
          <div className="cv-rate" aria-label={`Rate: ${rate} ${fiat} equals 1 coin`}>
            <span className="cv-rate-num">{sym}{rate} = 1</span>
            <span className="cv-rate-coin">◉ coin</span>
          </div>
        </div>

        <div className="cv-stage">
          <div className="cv-coin-scene" aria-hidden="true">
            <div className="cv-coin" key={spinKey} data-spinning={spinning ? "1" : undefined}>
              <div className="cv-coin-edge" />
              <div className="cv-coin-face cv-coin-back">
                <span className="cv-coin-glyph">R</span>
                <span className="cv-coin-word">ROYALE</span>
              </div>
              <div className="cv-coin-face cv-coin-front">
                <span className="cv-coin-glyph">◉</span>
                <span className="cv-coin-word">COIN</span>
              </div>
            </div>
          </div>
          <div className="cv-coins-readout">
            <span>Your coins</span>
            <b>◉ {displayCoins}</b>
          </div>
        </div>

        {mode === "SIM" ? (
          <div className="cv-sim">
            <p>
              Converting is for <b>REAL cash</b>. You are in SIM mode — SIM is play money
              and can never be converted.
            </p>
            <button className="btn btn-gold cv-switch" type="button" onClick={() => setMode("REAL")}>
              Switch to REAL
            </button>
            <p className="cv-hint cv-sim-hint">Coins are play-only — never withdrawable.</p>
          </div>
        ) : (
          <>
            <label className="cv-label" htmlFor="cv-amount">
              Cash amount
            </label>
            <div className="cv-input-row">
              <span className="cv-cur" aria-hidden="true">
                {sym}
              </span>
              <input
                id="cv-amount"
                className="cv-input"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={text}
                aria-label={`Cash amount in ${fiat}`}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9.]/g, "");
                  setText(v.indexOf(".") === v.lastIndexOf(".") ? v : v.slice(0, -1));
                  setError(null);
                }}
                onBlur={onBlurSnap}
              />
            </div>
            <div className="cv-chips" role="group" aria-label="Quick amounts">
              {chips.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="cv-chip"
                  aria-pressed={parsed === c}
                  onClick={() => {
                    setText(String(c));
                    setError(null);
                  }}
                >
                  {c}
                </button>
              ))}
            </div>

            <p className="cv-preview" aria-live="polite">
              {justConverted ? (
                <span className="cv-flash" key={`flash-${justConverted.gained}-${justConverted.debited}`}>
                  {sym}{fmtAmt(justConverted.debited)} became {justConverted.gained} ◉ coins
                </span>
              ) : parsed >= rate ? (
                <span>
                  {sym}{fmtAmt(parsed)} <span className="cv-arrow">→</span> {previewCoins} ◉ coins
                </span>
              ) : parsed > 0 ? (
                <span>Minimum {sym}{rate} to convert</span>
              ) : (
                <span>Type an amount to see your coins</span>
              )}
            </p>

            <button className="btn btn-gold cv-convert" type="button" disabled={!canConvert} onClick={convert}>
              {busy ? "Converting…" : `Convert ${sym}${fmtAmt(parsed >= rate ? parsed : rate)}`}
            </button>

            <div className="cv-msg" role="status">
              {insufficient && (
                <>
                  <p className="cv-err">
                    Not enough cash — you have {fmtMoney(cash, fiat)} and need {sym}{fmtAmt(parsed)}.
                  </p>
                  <button className="cv-dep-link" type="button" onClick={() => setDepositOpen(true)}>
                    Deposit cash →
                  </button>
                </>
              )}
              {error && !insufficient && <p className="cv-err">{error}</p>}
              {!insufficient && !error && (
                <p className="cv-hint">Coins are play-only — never withdrawable.</p>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
