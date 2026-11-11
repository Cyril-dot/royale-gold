import { Prisma } from "@prisma/client";

/** Round a GH₵ amount to pesewas (2dp), half-up. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function toDecimal(n: number): Prisma.Decimal {
  return new Prisma.Decimal(round2(n).toFixed(2));
}

/** Prisma Decimal -> plain number for JSON responses. */
export function dec(n: Prisma.Decimal | number | string | null | undefined): number {
  if (n === null || n === undefined) return 0;
  return typeof n === "number" ? n : Number(n.toString());
}

export function todayStr(d = new Date()): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

export function yesterdayStr(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return todayStr(d);
}

/** YYYY-MM-DD (UTC) of a Date. */
export function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
