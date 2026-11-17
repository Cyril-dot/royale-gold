// Dialog / ConfirmDialog — focus-trapped modal; typed-reason variant.
// Shows amount, currency, target and consequence; double-submit disabled.
// Success toasts link to the audit entry — the CALLER writes the audit
// entry server-side; this component never claims a log that wasn't made.
"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./Button";
import { FormField, Input } from "./Form";

function useFocusTrap(open: boolean, ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) return;
    const focusables = () =>
      Array.from(el.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [tabindex]:not([tabindex='-1'])")).filter(
        (n) => !n.hasAttribute("disabled") && n.offsetParent !== null,
      );
    const first = focusables()[0];
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, ref]);
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useFocusTrap(open, ref);
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
    <div className="st-dialog-backdrop" onClick={onClose}>
      <div
        className="st-dialog"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-labelledby={labelledBy}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="st-dialog-title">{title}</h3>
        <div className="st-dialog-body">{children}</div>
      </div>
    </div>
  );
}

/** ConfirmDialog — the money-safe pattern (audit §4.7 / brief §4.7).
 *  - facts: amount, currency, target, consequence (shown as a table)
 *  - reasonRequired: free-text reason, ≥3 chars, blocks confirm until given
 *  - typedConfirm: the user must TYPE this word to confirm (danger zone)
 *  - auditNote: shown when the caller will write an audit entry
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  facts = [],
  reasonRequired = false,
  reasonLabel = "Reason (required)",
  typedConfirm,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  auditNote = true,
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
  title: string;
  body?: string;
  facts?: { label: string; value: string }[];
  reasonRequired?: boolean;
  reasonLabel?: string;
  /** Word the user must type to confirm, e.g. "PAUSE". */
  typedConfirm?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  auditNote?: boolean;
  busy?: boolean;
}) {
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);
  useFocusTrap(open, ref);

  // Reset on close (not on open): every close path goes through here,
  // so the next open starts clean without an effect cascade.
  const close = useCallback(() => {
    setReason("");
    setTyped("");
    setError("");
    onClose();
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;
  const reasonOk = !reasonRequired || reason.trim().length >= 3;
  const typedOk = !typedConfirm || typed.trim() === typedConfirm;
  const canConfirm = reasonOk && typedOk && !busy;

  const confirm = async () => {
    if (!reasonOk) {
      setError("A reason of at least 3 characters is required.");
      return;
    }
    if (!typedOk) {
      setError(`Type ${typedConfirm} to confirm.`);
      return;
    }
    setError("");
    await onConfirm(reason.trim());
  };

  return (
    <div className="st-dialog-backdrop" onClick={close}>
      <div
        className="st-dialog"
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="st-dialog-title">{title}</h3>
        <div className="st-dialog-body">
          {body ? <p>{body}</p> : null}
          {facts.length > 0 ? (
            <dl className="st-dialog-facts">
              {facts.map((f) => (
                <div key={f.label} style={{ display: "contents" }}>
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {reasonRequired ? (
            <FormField label={reasonLabel} required error={error || undefined}>
              <Input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this happening?"
                aria-label={reasonLabel}
              />
            </FormField>
          ) : null}
          {typedConfirm ? (
            <FormField label={`Type ${typedConfirm} to confirm`} required error={!typedOk && error ? error : undefined}>
              <Input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={typedConfirm}
                aria-label={`Type ${typedConfirm} to confirm`}
                autoComplete="off"
              />
            </FormField>
          ) : null}
          {!reasonRequired && !typedConfirm && error ? <p className="st-field-error">{error}</p> : null}
          {auditNote ? <p>This will be written to the audit log.</p> : null}
        </div>
        <div className="st-dialog-actions">
          <Button variant="ghost" onClick={close} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={() => void confirm()} loading={busy} disabled={!canConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
