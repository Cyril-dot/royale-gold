// P0 Batch 1 — withdrawal rules shared by the admin and owner routes.
// A withdrawal is a REQUEST only — no real money moves (deposits are
// demo cashier only). Maker-checker: an admin approves first; above the
// threshold the owner must approve second before it is final.

/** Above this amount (GH₵) a withdrawal needs the owner's second approval. */
export const WITHDRAWAL_OWNER_THRESHOLD = 500;

/** Statuses: pending -> approved | admin_approved -> approved | rejected. */
export type WithdrawalStatus = "pending" | "admin_approved" | "approved" | "rejected";

/** True when an admin's approval alone is NOT final — the owner must second it. */
export function needsOwnerApproval(amount: number): boolean {
  return amount > WITHDRAWAL_OWNER_THRESHOLD;
}

export const WITHDRAWAL_METHODS = ["MTN", "Telecel", "AirtelTigo", "card"] as const;
