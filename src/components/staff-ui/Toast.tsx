// Toast — text + kind + optional Undo + optional link.
// Self-contained: useStaffToast() owns the list; StaffToastHost renders it.
// Undo is real: the caller passes onUndo, which runs when tapped.
"use client";

import { useCallback, useRef, useState } from "react";

export type StaffToastKind = "info" | "win" | "lose";

export interface StaffToast {
  id: number;
  text: string;
  kind: StaffToastKind;
  undoLabel?: string;
  onUndo?: () => void;
  linkLabel?: string;
  linkHref?: string;
}

export function useStaffToast() {
  const [toasts, setToasts] = useState<StaffToast[]>([]);
  const idRef = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (toast: Omit<StaffToast, "id">, ms = 6000) => {
      // Id from a ref counter — never Date.now() in a render initializer.
      const id = ++idRef.current;
      setToasts((cur) => [...cur.slice(-2), { ...toast, id }]);
      const timer = setTimeout(() => dismiss(id), ms);
      timers.current.set(id, timer);
      return id;
    },
    [dismiss],
  );

  const undo = useCallback(
    (id: number) => {
      setToasts((cur) => {
        const found = cur.find((t) => t.id === id);
        found?.onUndo?.();
        return cur.filter((t) => t.id !== id);
      });
    },
    [],
  );

  return { toasts, push, dismiss, undo };
}

export function StaffToastHost({
  toasts,
  onDismiss,
  onUndo,
}: {
  toasts: StaffToast[];
  onDismiss: (id: number) => void;
  onUndo: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="st-toast-host" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`st-toast st-toast-${t.kind}`} role="status">
          <span className="st-toast-text">{t.text}</span>
          {t.linkHref ? (
            <a className="st-toast-undo" href={t.linkHref}>
              {t.linkLabel ?? "View"}
            </a>
          ) : null}
          {t.onUndo ? (
            <button type="button" className="st-toast-undo" onClick={() => onUndo(t.id)}>
              {t.undoLabel ?? "Undo"}
            </button>
          ) : null}
          <button type="button" className="st-toast-close" aria-label="Dismiss notification" onClick={() => onDismiss(t.id)}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
