// Skeleton / EmptyState / ErrorState — one honest line + next action.
"use client";

import type { ReactNode } from "react";
import { Button } from "./Button";

export function Skeleton({ lines = 3, title = false }: { lines?: number; title?: boolean }) {
  return (
    <div aria-hidden="true">
      {title ? <div className="st-skeleton st-skeleton-title" /> : null}
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="st-skeleton st-skeleton-line" style={{ width: `${92 - i * 9}%` }} />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return <div className="st-skeleton st-skeleton-card" aria-hidden="true" />;
}

export function EmptyState({
  icon = "—",
  title,
  text,
  actionLabel,
  onAction,
}: {
  icon?: string;
  title: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="st-state" role="status">
      <span className="st-state-icon" aria-hidden="true">
        {icon}
      </span>
      <p className="st-state-title">{title}</p>
      <p className="st-state-text">{text}</p>
      {actionLabel && onAction ? (
        <Button variant="secondary" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function ErrorState({
  title = "Could not load this.",
  text = "Something went wrong on our side. Your data is safe — try again.",
  onRetry,
  children,
}: {
  title?: string;
  text?: string;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="st-state" role="alert">
      <span className="st-state-icon" aria-hidden="true">
        !
      </span>
      <p className="st-state-title">{title}</p>
      <p className="st-state-text st-error-text">{text}</p>
      {children}
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}
