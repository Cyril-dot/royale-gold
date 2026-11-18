// Sheet — mobile bottom sheet (centred dialog ≥761px). Escape/backdrop close.
// Focus is trapped inside while open and returns to the opener on close (Phase 7).
"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useFocusTrap } from "./Dialog";

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(open, sheetRef);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <button type="button" className="st-sheet-backdrop" aria-label="Close panel" onClick={onClose} />
      <div className="st-sheet" ref={sheetRef} role="dialog" aria-modal="true" aria-label={title}>
        <div className="st-sheet-handle" aria-hidden="true" />
        <h3 className="st-sheet-title">{title}</h3>
        {children}
      </div>
    </>
  );
}
