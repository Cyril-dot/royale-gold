// staff-ui formatting helpers — money + masking.
// Money: symbol + grouped 2dp, matching the live site's display style
// (owner page prints GH₵66,200.00 via toLocaleString, not fmtMoney's
// ungrouped form). Never sum across currencies — callers pass one fiat.
import { symbolFor } from "../../lib/country";

export function fmtStaffMoney(n: number, currency = "GHS"): string {
  const v = Number(n || 0);
  // No space after the symbol — matches the live owner panel and the
  // audit's own example ("GH₵66,200.00").
  return (
    symbolFor(currency) +
    v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

export function fmtStaffInt(n: number): string {
  return Math.round(Number(n || 0)).toLocaleString("en-GB");
}

/** Mask a MoMo/bank number: keep first 3 + last 2 chars, e.g. 024•••••78.
 *  Short values (< 6 chars) are fully masked. Never returns the full value. */
export function maskAccount(value: string): string {
  const v = (value || "").replace(/\s+/g, "");
  if (v.length < 6) return "•".repeat(Math.max(v.length, 4));
  return `${v.slice(0, 3)}${"•".repeat(Math.max(v.length - 5, 3))}${v.slice(-2)}`;
}

/** Mask an email: first char + •••• + domain, e.g. k•••••@example.com */
export function maskEmail(value: string): string {
  const v = value || "";
  const at = v.indexOf("@");
  if (at <= 1) return "•••••";
  return `${v[0]}•••••${v.slice(at)}`;
}

/** Mask a phone the same way as an account number. */
export function maskPhone(value: string): string {
  return maskAccount(value);
}
