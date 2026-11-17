// Card + KpiTile — flat by default (transparent + hairline separator).
"use client";

import type { ReactNode } from "react";

export function Card({
  title,
  sub,
  boxed = false,
  children,
  id,
}: {
  title?: string;
  sub?: string;
  boxed?: boolean;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className={boxed ? "st-card st-card-boxed" : "st-card"} id={id} aria-label={title}>
      {title ? <h3 className="st-card-title">{title}</h3> : null}
      {sub ? <p className="st-card-sub">{sub}</p> : null}
      {children}
    </section>
  );
}

export interface KpiTileProps {
  label: string;
  value: string;
  sub?: string;
  /** Delta vs previous period, e.g. "+12%" — shown only when the caller
   *  passes it (Prime tiles keep the today sub-line only). */
  delta?: string;
  deltaUp?: boolean;
  /** Deep link — tiles are links, not dead numbers. */
  href?: string;
  onClick?: () => void;
}

/** KPI tile: value (Outfit bold, tabular) + label + sub-line + optional delta. */
export function KpiTile({ label, value, sub, delta, deltaUp, href, onClick }: KpiTileProps) {
  const inner = (
    <>
      <span className="st-kpi-label">{label}</span>
      <span className="st-kpi-value">{value}</span>
      {sub || delta ? (
        <span className="st-kpi-sub">
          {delta ? (
            <span className={`st-kpi-delta ${deltaUp === false ? "st-kpi-delta-down" : "st-kpi-delta-up"}`}>
              {delta}
            </span>
          ) : null}
          {delta && sub ? " · " : ""}
          {sub ?? ""}
        </span>
      ) : null}
    </>
  );
  if (href) {
    return (
      <a className="st-kpi" href={href} aria-label={`${label}: ${value}`}>
        {inner}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" className="st-kpi" onClick={onClick} aria-label={`${label}: ${value}`}>
        {inner}
      </button>
    );
  }
  return <div className="st-kpi st-kpi-static">{inner}</div>;
}
