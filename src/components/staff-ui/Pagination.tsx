// Pagination — page controls + per-page + total count.
// Shape is server-ready: the caller owns page/pageSize and fetches;
// the demo drives it over local sample data with the same props.
"use client";

import { Button } from "./Button";
import { Select } from "./Form";

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="st-pagination">
      <span className="st-pagination-info">
        {from}–{to} of {total.toLocaleString("en-GB")}
      </span>
      {onPageSizeChange ? (
        <label>
          <span className="sr-only">Rows per page</span>
          <Select
            value={String(pageSize)}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            aria-label="Rows per page"
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </Select>
        </label>
      ) : null}
      <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        ← Prev
      </Button>
      <span aria-live="polite">
        Page {page} of {totalPages}
      </span>
      <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        Next →
      </Button>
    </div>
  );
}
