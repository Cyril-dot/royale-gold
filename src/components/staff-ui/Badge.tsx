// Badge / StatusPill — status is NEVER colour-alone: dot + text always.
// Variants: paid/ok, pending, rejected/danger, held/warn, muted, info.
"use client";

export type BadgeVariant = "paid" | "ok" | "pending" | "rejected" | "danger" | "held" | "warn" | "muted" | "info";

export function Badge({ variant = "muted", children }: { variant?: BadgeVariant; children: React.ReactNode }) {
  return (
    <span className={`st-badge st-badge-${variant}`}>
      <span className="st-badge-dot" aria-hidden="true" />
      {children}
    </span>
  );
}

/** Convenience: map a withdrawal/payout status string to a pill. */
export function StatusPill({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === "approved" || s === "paid" || s === "ok") return <Badge variant="paid">{status}</Badge>;
  if (s === "pending" || s === "awaiting owner" || s === "admin_approved") return <Badge variant="pending">{status}</Badge>;
  if (s === "rejected" || s === "failed") return <Badge variant="rejected">{status}</Badge>;
  if (s === "held") return <Badge variant="held">{status}</Badge>;
  return <Badge variant="muted">{status}</Badge>;
}
