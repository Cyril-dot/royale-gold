// DataTable — the shared list pattern (audit §6).
// Server-driven shape: the caller owns rows/page/sort/filters and fetches
// (cursor/page params land on the endpoints in Phase 3+); the demo drives
// it over local sample data with identical props. ≤760px renders CardList.
// Saved views live in localStorage (per-viewer convenience only).
"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "./Button";
import { Input } from "./Form";
import { Chip } from "./Tabs";
import { Pagination } from "./Pagination";
import { Skeleton, EmptyState, ErrorState } from "./Feedback";

export interface DataColumn<T> {
  key: string;
  label: string;
  sortable?: boolean;
  /** Primary cell content. Keep the primary short; secondary goes in `sub`. */
  render: (row: T) => ReactNode;
  /** Secondary line under the primary (contact, date, method…). */
  sub?: (row: T) => ReactNode;
  /** CardList detail rows on phone: [label, value] pairs. */
  details?: (row: T) => [string, ReactNode][];
}

export interface DataRowAction<T> {
  label: string;
  onClick: (row: T) => void;
  danger?: boolean;
  disabled?: (row: T) => boolean;
}

export interface DataFilter {
  id: string;
  label: string;
  count?: number;
}

export function DataTable<T extends { id: string }>({
  viewId,
  columns,
  rows,
  total,
  page,
  pageSize,
  onPageChange,
  sortKey,
  sortDir,
  onSort,
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  filters = [],
  activeFilter,
  onFilterChange,
  onExportCsv,
  loading = false,
  error = null,
  onRetry,
  emptyTitle = "Nothing here yet.",
  emptyText = "No rows match the current filters.",
  emptyActionLabel,
  onEmptyAction,
  rowActions = [],
  bulkActions = [],
  selectedIds,
  onSelectionChange,
  expandable = false,
  expandRender,
  rowHref,
}: {
  viewId: string;
  columns: DataColumn<T>[];
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  sortKey?: string;
  sortDir?: "asc" | "desc";
  onSort?: (key: string) => void;
  search?: string;
  onSearchChange?: (q: string) => void;
  searchPlaceholder?: string;
  filters?: DataFilter[];
  activeFilter?: string;
  onFilterChange?: (id: string) => void;
  onExportCsv?: () => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyText?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  rowActions?: DataRowAction<T>[];
  bulkActions?: { label: string; onClick: (ids: string[]) => void }[];
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  expandable?: boolean;
  expandRender?: (row: T) => ReactNode;
  rowHref?: (row: T) => string;
}) {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Saved view (localStorage, per-viewer convenience): the last filter +
  // sort for this view id. Lazy initializer — never holds row data.
  const [savedView] = useState<string | null>(() => {
    try {
      return typeof window === "undefined" ? null : window.localStorage.getItem(`staff-view:${viewId}`);
    } catch {
      return null;
    }
  });
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Persist the current filter + sort (external-system sync — no setState).
  useEffect(() => {
    try {
      window.localStorage.setItem(
        `staff-view:${viewId}`,
        JSON.stringify({ filter: activeFilter ?? "", sortKey: sortKey ?? "", sortDir: sortDir ?? "" }),
      );
    } catch {
      /* storage unavailable — the table still works, nothing is saved */
    }
  }, [viewId, activeFilter, sortKey, sortDir]);

  // Close the row-actions menu on outside click / Escape.
  useEffect(() => {
    if (!menuOpenId) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpenId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpenId(null);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpenId]);

  const allSelected = selectedIds !== undefined && rows.length > 0 && rows.every((r) => selectedIds.includes(r.id));
  const toggleAll = () => {
    if (!onSelectionChange || !selectedIds) return;
    onSelectionChange(allSelected ? selectedIds.filter((id) => !rows.some((r) => r.id === id)) : [...new Set([...selectedIds, ...rows.map((r) => r.id)])]);
  };
  const toggleOne = (id: string) => {
    if (!onSelectionChange || !selectedIds) return;
    onSelectionChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  const sortIndicator = (key: string) => (sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "");
  const firstCol = columns[0];
  const amountCol = useMemo(() => columns.find((c) => /amount|total|owed|paid/i.test(c.key)), [columns]);

  return (
    <div>
      <div className="st-table-tools">
        <div className="st-table-search">
          {onSearchChange ? (
            <Input
              type="search"
              placeholder={searchPlaceholder}
              value={search ?? ""}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label={searchPlaceholder}
              enterKeyHint="search"
            />
          ) : null}
          {onExportCsv ? (
            <Button variant="secondary" size="sm" onClick={onExportCsv}>
              Export CSV
            </Button>
          ) : null}
        </div>
        {filters.length > 0 && onFilterChange ? (
          <div className="st-chip-row" role="group" aria-label="Filters">
            {filters.map((f) => (
              <Chip
                key={f.id}
                label={f.label}
                count={f.count}
                active={activeFilter === f.id}
                onClick={() => onFilterChange(f.id)}
                onRemove={activeFilter === f.id && f.id !== "" ? () => onFilterChange("") : undefined}
              />
            ))}
          </div>
        ) : null}
        {savedView ? <p className="st-demo-note">Saved view restored for this list (filter + sort only).</p> : null}
      </div>

      {selectedIds !== undefined && selectedIds.length > 0 && bulkActions.length > 0 ? (
        <div className="st-chip-row" style={{ marginBottom: 12 }}>
          <span>
            {selectedIds.length} selected
          </span>
          {bulkActions.map((a) => (
            <Button key={a.label} variant="secondary" size="sm" onClick={() => a.onClick(selectedIds)}>
              {a.label}
            </Button>
          ))}
        </div>
      ) : null}

      {loading ? (
        <Skeleton lines={5} />
      ) : error ? (
        <ErrorState text={error} onRetry={onRetry} />
      ) : rows.length === 0 ? (
        <EmptyState title={emptyTitle} text={emptyText} actionLabel={emptyActionLabel} onAction={onEmptyAction} />
      ) : (
        <>
          <div className="st-table-wrap">
            <table className="st-table">
              <thead>
                <tr>
                  {onSelectionChange ? (
                    <th>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        aria-label="Select all rows on this page"
                      />
                    </th>
                  ) : null}
                  {columns.map((c) => (
                    <th key={c.key} scope="col">
                      {c.sortable && onSort ? (
                        <button
                          type="button"
                          className="st-sort-btn"
                          onClick={() => onSort(c.key)}
                          aria-sort={sortKey === c.key ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                        >
                          {c.label}
                          {sortIndicator(c.key)}
                        </button>
                      ) : (
                        c.label
                      )}
                    </th>
                  ))}
                  {expandable ? <th scope="col"><span className="sr-only">Expand</span></th> : null}
                  {rowActions.length > 0 ? <th scope="col"><span className="sr-only">Actions</span></th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  return (
                    <Fragment key={row.id}>
                      <tr>
                        {onSelectionChange ? (
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedIds?.includes(row.id) ?? false}
                              onChange={() => toggleOne(row.id)}
                              aria-label={`Select row ${row.id}`}
                            />
                          </td>
                        ) : null}
                        {columns.map((c, ci) => (
                          <td key={c.key}>
                            <span className="st-cell-primary">
                              {ci === 0 && rowHref ? <a href={rowHref(row)}>{c.render(row)}</a> : c.render(row)}
                            </span>
                            {c.sub ? <span className="st-cell-sub">{c.sub(row)}</span> : null}
                          </td>
                        ))}
                        {expandable ? (
                          <td>
                            <button
                              type="button"
                              className="st-copy-btn"
                              aria-expanded={expandedId === row.id}
                              onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                            >
                              {expandedId === row.id ? "Hide" : "Details"}
                            </button>
                          </td>
                        ) : null}
                        {rowActions.length > 0 ? (
                          <td>
                            <div className="st-row-actions" ref={menuOpenId === row.id ? menuRef : undefined}>
                              <button
                                type="button"
                                className="st-copy-btn"
                                aria-haspopup="menu"
                                aria-expanded={menuOpenId === row.id}
                                onClick={() => setMenuOpenId(menuOpenId === row.id ? null : row.id)}
                              >
                                Actions ▾
                              </button>
                              {menuOpenId === row.id ? (
                                <div className="st-row-actions-menu" role="menu">
                                  {rowActions.map((a) => (
                                    <button
                                      key={a.label}
                                      type="button"
                                      role="menuitem"
                                      aria-disabled={a.disabled?.(row) ? "true" : undefined}
                                      onClick={() => {
                                        if (a.disabled?.(row)) return;
                                        setMenuOpenId(null);
                                        a.onClick(row);
                                      }}
                                    >
                                      {a.label}
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </td>
                        ) : null}
                      </tr>
                      {expandable && expandedId === row.id && expandRender ? (
                        <tr key={`${row.id}-x`} className="st-table-row-expand">
                          <td colSpan={columns.length + (onSelectionChange ? 1 : 0) + (rowActions.length > 0 ? 1 : 0) + 1}>
                            {expandRender(row)}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Phone fallback: cards, never a squeezed table. */}
          <div className="st-cardlist">
            {rows.map((row) => {
              const details = columns
                .slice(1)
                .flatMap((c) => c.details?.(row) ?? [])
                .filter((d): d is [string, ReactNode] => Boolean(d));
              return (
                <article key={row.id} className="st-cardlist-row">
                  <div className="st-cardlist-top">
                    <div className="st-cardlist-title">
                      {firstCol.render(row)}
                      {firstCol.sub ? <div className="st-cardlist-meta">{firstCol.sub(row)}</div> : null}
                    </div>
                    {amountCol ? <span className="st-amount st-cardlist-amount">{amountCol.render(row)}</span> : null}
                  </div>
                  {details.length > 0 ? (
                    <dl className="st-cardlist-more">
                      {details.map(([label, value]) => (
                        <div key={label} style={{ display: "contents" }}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  {expandable ? (
                    <div className="st-cardlist-expand">
                      <button
                        type="button"
                        className="st-copy-btn"
                        aria-expanded={expandedId === row.id}
                        onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                      >
                        {expandedId === row.id ? "Hide" : "Details"}
                      </button>
                      {expandedId === row.id && expandRender ? expandRender(row) : null}
                    </div>
                  ) : null}
                  {rowActions.length > 0 ? (
                    <div className="st-cardlist-actions">
                      {rowActions.map((a) => (
                        <Button
                          key={a.label}
                          variant={a.danger ? "danger" : "secondary"}
                          size="sm"
                          disabled={a.disabled?.(row)}
                          onClick={() => a.onClick(row)}
                        >
                          {a.label}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>

          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} />
        </>
      )}
    </div>
  );
}
