// P1 Batch 1 (A15): withdrawal risk flags — the flag keys and their
// display labels. Client-safe (no server imports): the Money page is a
// client component and imports the labels to render the pills, while
// the server-only computation lives in src/lib/withdrawals.ts.

/** Above this amount a withdrawal needs the owner's second approval.
 * GHS default only — the live per-fiat thresholds live in
 * CurrencyConfig (see withdrawalOwnerThresholdFor in ./withdrawals);
 * the admin Money page shows the per-fiat value from the API. */
export const WITHDRAWAL_OWNER_THRESHOLD = 500;

/** Withdrawal methods a player can request. "bank" pays to the saved
 * bank account (Nov 2026); the rest are MoMo / card as before. Kept
 * here (client-safe) so the convert page can render the method picker
 * from the same list the server validates against. */
export const WITHDRAWAL_METHODS = ["MTN", "Telecel", "AirtelTigo", "card", "bank"] as const;

export type WithdrawalRiskFlag = "new-account" | "large-vs-deposits" | "rapid" | "unusual";

export const WITHDRAWAL_RISK_LABELS: Record<WithdrawalRiskFlag, string> = {
  "new-account": "New account",
  "large-vs-deposits": "Larger than deposits",
  "rapid": "Rapid requests",
  "unusual": "Unusual amount",
};
