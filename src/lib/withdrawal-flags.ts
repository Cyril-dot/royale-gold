// P1 Batch 1 (A15): withdrawal risk flags — the flag keys and their
// display labels. Client-safe (no server imports): the Money page is a
// client component and imports the labels to render the pills, while
// the server-only computation lives in src/lib/withdrawals.ts.

/** Above this amount (GH₵) a withdrawal needs the owner's second approval. */
export const WITHDRAWAL_OWNER_THRESHOLD = 500;

export type WithdrawalRiskFlag = "new-account" | "large-vs-deposits" | "rapid" | "unusual";

export const WITHDRAWAL_RISK_LABELS: Record<WithdrawalRiskFlag, string> = {
  "new-account": "New account",
  "large-vs-deposits": "Larger than deposits",
  "rapid": "Rapid requests",
  "unusual": "Unusual amount",
};
