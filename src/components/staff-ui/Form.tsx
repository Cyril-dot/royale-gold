// Form controls — Input / Select / AmountInput / DateRange / FormField.
// 16px font (no iOS zoom), correct inputmode, labelled, error state.
"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`st-input ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`st-select ${props.className ?? ""}`} />;
}

/** Money input: decimal keyboard, tabular bold figures. */
export function AmountInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      {...props}
      className={`st-input st-amount-input ${props.className ?? ""}`}
    />
  );
}

export interface DateRangeValue {
  from: string;
  to: string;
}

export function DateRange({
  value,
  onChange,
  label = "Date range",
  max,
}: {
  value: DateRangeValue;
  onChange: (v: DateRangeValue) => void;
  label?: string;
  max?: string;
}) {
  return (
    <div className="st-daterange" role="group" aria-label={label}>
      <label className="st-field">
        <span className="st-field-label">From</span>
        <input
          type="date"
          className="st-input"
          value={value.from}
          max={max}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
          aria-label="From date"
        />
      </label>
      <label className="st-field">
        <span className="st-field-label">To</span>
        <input
          type="date"
          className="st-input"
          value={value.to}
          max={max}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
          aria-label="To date"
        />
      </label>
    </div>
  );
}

/** FormField — label above input + hint + error, one component. */
export function FormField({
  label,
  hint,
  error,
  required = false,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="st-field">
      <label className="st-field-label" htmlFor={htmlFor}>
        {label}
        {required ? <span className="st-field-required" aria-hidden="true"> *</span> : null}
        {required ? <span className="sr-only"> (required)</span> : null}
      </label>
      {children}
      {error ? (
        <span className="st-field-error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="st-field-hint">{hint}</span>
      ) : null}
    </div>
  );
}
