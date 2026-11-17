// Tabs + Segmented + Chip / FilterChip.
//
// CHUKS'S RULE (22:49): navigation is TAB-BASED but each tab is its OWN
// ROUTE. A tab is something you CLICK and it SHOWS THE PAGE — real
// navigation to that section's own URL (deep-linkable, Back/forward
// works). Never state tabs that just reveal a hidden section on the same
// page — that is exactly the owner monolith problem being fixed.
//
// So there are TWO different controls here, deliberately separate:
// - Tabs: NAVIGATION. Items are LINKS (href, incl. ?view= deep links).
//   Clicking one navigates. Active state comes from the pathname.
// - Segmented: a CHOICE control, not navigation (e.g. a demo fixture
//   switch or a filter). It never pretends to be a page tab.
"use client";

import { useRef, type KeyboardEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface TabItem {
  id: string;
  label: string;
  href: string;
  count?: number;
}

/** Route-based tabs — each tab is a link to its own page. */
export function Tabs({ items, label }: { items: TabItem[]; label: string }) {
  const pathname = usePathname() ?? "";
  const listRef = useRef<HTMLDivElement | null>(null);
  const isActive = (item: TabItem) => {
    if (item.href.includes("?")) return pathname === item.href.split("?")[0];
    return item.href === "/admin" || item.href === "/owner"
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const links = Array.from(listRef.current?.querySelectorAll<HTMLElement>("a[role='tab']") ?? []);
    const idx = links.indexOf(document.activeElement as HTMLElement);
    if (idx === -1) return;
    e.preventDefault();
    const next = e.key === "ArrowRight" ? (idx + 1) % links.length : (idx - 1 + links.length) % links.length;
    links[next]?.focus();
  };
  return (
    <div ref={listRef} className="st-tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {items.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          role="tab"
          aria-selected={isActive(t)}
          className="st-tab"
          aria-current={isActive(t) ? "page" : undefined}
        >
          {t.label}
          {typeof t.count === "number" ? <span className="st-tab-count"> ({t.count})</span> : null}
        </Link>
      ))}
    </div>
  );
}

export interface SegmentedItem {
  id: string;
  label: string;
  count?: number;
}

/** Segmented choice control — NOT navigation. For demo fixtures, filters
 *  and other in-place choices. Never use it to switch pages. */
export function Segmented({
  items,
  value,
  onChange,
  label,
}: {
  items: SegmentedItem[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const idx = items.findIndex((t) => t.id === value);
    const next = e.key === "ArrowRight" ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
    onChange(items[next].id);
    listRef.current?.querySelectorAll<HTMLButtonElement>("[role='tab']")[next]?.focus();
  };
  return (
    <div
      ref={listRef}
      className="st-segmented"
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          className="st-tab"
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {typeof t.count === "number" ? <span className="st-tab-count"> ({t.count})</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Chip({
  label,
  count,
  active = false,
  onClick,
  onRemove,
}: {
  label: string;
  count?: number;
  active?: boolean;
  onClick?: () => void;
  /** Removable filter chip — shows an × that clears the filter. */
  onRemove?: () => void;
}) {
  return (
    <button
      type="button"
      className={`st-chip${active ? " st-chip-on" : ""}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {label}
      {typeof count === "number" ? <span className="st-chip-count">{count}</span> : null}
      {onRemove ? (
        <span
          className="st-chip-x"
          role="button"
          tabIndex={0}
          aria-label={`Remove filter ${label}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onRemove();
            }
          }}
        >
          ✕
        </span>
      ) : null}
    </button>
  );
}
