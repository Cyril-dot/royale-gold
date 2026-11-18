// CommandPalette — ⌘K / long-press search: jump to any page, find a
// player or admin, run safe quick actions. No money-moving actions here.
"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFocusTrap } from "./Dialog";

export interface PaletteAction {
  id: string;
  group: string;
  label: string;
  sub?: string;
  href?: string;
  onSelect?: () => void;
}

export function CommandPalette({
  open,
  onClose,
  actions,
  onQueryChange,
}: {
  open: boolean;
  onClose: () => void;
  actions: PaletteAction[];
  /** Live query callback — lets the shell append player/admin results
   *  as the owner types (debounced by the caller). */
  onQueryChange?: (q: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();
  const router = useRouter();
  // Focus trap + return focus to the Search button on close (Phase 7).
  useFocusTrap(open, boxRef);

  // Reset on open (render-phase derived state — the React-endorsed
  // pattern for "adjust state when a prop changes"; no effect cascade).
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setQuery("");
      setActive(0);
    }
  }

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? actions.filter((a) => `${a.label} ${a.sub ?? ""}`.toLowerCase().includes(q)) : actions;
    return list.slice(0, 12);
  }, [actions, query]);

  const onQueryChangeInner = (q: string) => {
    setQuery(q);
    setActive(0);
    onQueryChange?.(q);
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const select = (a: PaletteAction) => {
    onClose();
    if (a.onSelect) a.onSelect();
    else if (a.href) router.push(a.href);
  };

  const groups: { name: string; items: PaletteAction[] }[] = [];
  for (const a of filtered) {
    const g = groups.find((x) => x.name === a.group);
    if (g) g.items.push(a);
    else groups.push({ name: a.group, items: [a] });
  }

  return (
    <div className="st-cmdk-backdrop" onClick={onClose}>
      <div
        className="st-cmdk"
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search and quick actions"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="st-cmdk-input"
          type="search"
          role="combobox"
          aria-expanded={filtered.length > 0}
          aria-controls={listId}
          aria-activedescendant={filtered.length > 0 ? `${listId}-opt-${active}` : undefined}
          placeholder="Search pages, players, admins…"
          value={query}
          onChange={(e) => onQueryChangeInner(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(filtered.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter" && filtered[active]) {
              e.preventDefault();
              select(filtered[active]);
            }
          }}
          aria-label="Search pages, players and admins"
          enterKeyHint="search"
        />
        <ul className="st-cmdk-list" id={listId} role="listbox" aria-label="Results">
          {filtered.length === 0 ? (
            <li className="st-cmdk-empty">No matches for “{query}”.</li>
          ) : (
            groups.map((g) => (
              <li key={g.name}>
                <div className="st-cmdk-group">{g.name}</div>
                {g.items.map((a) => {
                  const idx = filtered.indexOf(a);
                  return (
                    <button
                      key={a.id}
                      id={`${listId}-opt-${idx}`}
                      type="button"
                      className="st-cmdk-item"
                      role="option"
                      aria-selected={idx === active}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => select(a)}
                    >
                      {a.label}
                      {a.sub ? <span className="st-cmdk-item-sub">{a.sub}</span> : null}
                    </button>
                  );
                })}
              </li>
            ))
          )}
        </ul>
        <div className="st-cmdk-hint">↑↓ to move · Enter to open · Esc to close</div>
      </div>
    </div>
  );
}

/** Global ⌘K / Ctrl+K hook — wire once per shell. */
export function useCommandPaletteHotkey(onOpen: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpen();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onOpen]);
}
