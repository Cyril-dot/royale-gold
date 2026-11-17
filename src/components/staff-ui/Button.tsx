// Button + IconButton — 44px min target, :active scale, hover gated in CSS.
"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  size?: "md" | "sm";
  block?: boolean;
}

export function Button({
  variant = "primary",
  loading = false,
  size = "md",
  block = false,
  disabled,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const cls = [
    "st-btn",
    `st-btn-${variant}`,
    size === "sm" ? "st-btn-sm" : "",
    block ? "st-btn-block" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={cls} disabled={disabled || loading} {...rest}>
      {loading ? <span className="st-btn-spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
}

/** Icon-only button — always labelled (aria-label), never ambiguous. */
export function IconButton({ label, children, className = "", ...rest }: IconButtonProps) {
  return (
    <button type="button" className={`st-icon-btn ${className}`} aria-label={label} {...rest}>
      {children}
    </button>
  );
}
