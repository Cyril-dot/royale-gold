// PageHeader + Breadcrumbs — title (Anton) + subtitle + actions + back link.
"use client";

import type { ReactNode } from "react";
import Link from "next/link";

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="st-crumbs">
        {items.map((c, i) =>
          c.href && i < items.length - 1 ? (
            <li key={c.label}>
              <Link href={c.href}>{c.label}</Link>
            </li>
          ) : (
            <li key={c.label} aria-current="page">
              {c.label}
            </li>
          ),
        )}
      </ol>
    </nav>
  );
}

export function PageHeader({
  title,
  sub,
  backHref,
  backLabel = "Back",
  actions,
  crumbs,
}: {
  title: string;
  sub?: string;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
  crumbs?: Crumb[];
}) {
  return (
    <div>
      {crumbs ? <Breadcrumbs items={crumbs} /> : null}
      {backHref ? (
        <Link href={backHref} className="st-back-link">
          ← {backLabel}
        </Link>
      ) : null}
      <div className="st-pagehead">
        <div className="st-pagehead-main">
          <h2 className="st-pagehead-title">{title}</h2>
          {sub ? <p className="st-pagehead-sub">{sub}</p> : null}
        </div>
        {actions ? <div className="st-pagehead-actions">{actions}</div> : null}
      </div>
    </div>
  );
}
