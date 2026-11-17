// Phase 1 country-based (Nov 2026): country → currency mapping and
// the display symbols for each fiat. Ported from BetWins
// (backend/services/currency.service.js) — the ISO-code keys and the
// GH→GHS / NG→NGN pairs. Only GH + NG are offered at register this
// phase (the other countries need Chuks to name them + their payment
// method first); the full map stays here so Phase 3 only has to open
// the picker, not re-derive the currencies.
//
// A user's currency is set ONCE at register from their country and is
// IMMUTABLE after that (see the User model). Money code must never
// re-derive a currency from a country at read time — read
// User.currency (or the row's fiatCurrency) instead.

export const COUNTRY_CURRENCIES: Record<string, string> = {
  GH: "GHS",
  NG: "NGN",
  KE: "KES",
  ZA: "ZAR",
  US: "USD",
  GB: "GBP",
  AU: "AUD",
  CA: "CAD",
  IN: "INR",
  DE: "EUR",
  FR: "EUR",
  IE: "EUR",
  ES: "EUR",
  IT: "EUR",
};

export const CURRENCY_SYMBOLS: Record<string, string> = {
  GHS: "GH₵",
  NGN: "₦",
  KES: "KSh",
  ZAR: "R",
  USD: "$",
  GBP: "£",
  AUD: "A$",
  CAD: "C$",
  INR: "₹",
  EUR: "€",
};

/** Fiat for an ISO country code. Unknown codes fall back to GHS. */
export function currencyForCountry(country: string | null | undefined): string {
  if (!country) return "GHS";
  return COUNTRY_CURRENCIES[country.toUpperCase()] ?? "GHS";
}

/** Display symbol for a fiat code. Unknown fiats fall back to GH₵. */
export function symbolFor(currency: string | null | undefined): string {
  if (!currency) return "GH₵";
  return CURRENCY_SYMBOLS[currency.toUpperCase()] ?? "GH₵";
}

/** Countries the register picker offers this phase — GH + NG only. */
export const COUNTRIES = [
  { code: "GH", name: "Ghana", currency: "GHS" },
  { code: "NG", name: "Nigeria", currency: "NGN" },
] as const;

/** True when the country code is one the picker offers. */
export function isOfferedCountry(country: string | null | undefined): boolean {
  if (!country) return false;
  return COUNTRIES.some((c) => c.code === country.toUpperCase());
}
