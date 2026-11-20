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

/** Countries the register picker offers this phase — GH + NG only.
 * `flag` is the regional-indicator emoji — it renders as the real
 * flag on phones, which is where the register form is previewed. */
export const COUNTRIES = [
  { code: "GH", name: "Ghana", currency: "GHS", flag: "🇬🇭" },
  { code: "NG", name: "Nigeria", currency: "NGN", flag: "🇳🇬" },
] as const;

/** True when the country code is one the picker offers. */
export function isOfferedCountry(country: string | null | undefined): boolean {
  if (!country) return false;
  return COUNTRIES.some((c) => c.code === country.toUpperCase());
}

/** Example local phone number for a country, as shown in the
 * email-or-phone field hint. GH numbers are 10 digits (0244 form);
 * NG numbers are 11 digits (0803 form). Unknown countries fall back
 * to the GH form — existing accounts are GH/GHS. */
export function phoneExample(country: string | null | undefined): string {
  if (!country) return "0244 000 000";
  switch (country.toUpperCase()) {
    case "NG":
      return "0803 000 0000";
    default:
      return "0244 000 000";
  }
}

/** Full placeholder for the email-or-phone field, following the
 * picked country live (register) or the GH default (login, which has
 * no country picker). */
export function phonePlaceholder(country: string | null | undefined): string {
  return `you@example.com or ${phoneExample(country)}`;
}
