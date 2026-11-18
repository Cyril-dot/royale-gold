// Shared owner helpers — moved verbatim from src/app/owner/page.tsx
// (Phase 2 split). Pure functions of their inputs; range resolution
// stays in an effect in OwnerContext, never during render.

// Overview activity feed (Nov 2026): relative time ("2h ago"). Pure
// function of the timestamp; the feed only renders after the client
// fetch, so there is no server/client mismatch.
export function relTime(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return iso.slice(0, 10);
}

export const ACT_VERB: Record<string, string> = {
  deposit: "Deposited",
  withdrawal: "Withdrawal",
  signup: "Joined",
  commission: "Commission paid",
};

// PRIME Phase 1 (Nov 2026): global date-range selector. Presets resolve
// to UTC [from, to] (inclusive); the previous equivalent period is the
// same length immediately before `from`. Reporting timezone stays UTC
// (TODO decision 4 — not settled here). Pure helpers of their inputs;
// the component resolves them in an effect, never during render.
export type RangePreset = "today" | "yesterday" | "7d" | "30d" | "week" | "lastweek" | "month" | "lastmonth" | "year" | "custom";
export const RANGE_PRESETS: { id: RangePreset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "week", label: "This week" },
  { id: "lastweek", label: "Last week" },
  { id: "month", label: "This month" },
  { id: "lastmonth", label: "Last month" },
  { id: "year", label: "This year" },
  { id: "custom", label: "Custom" },
];
export function addDaysStr(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function rangeForPreset(p: RangePreset, today: string, cFrom: string, cTo: string): { from: string; to: string } {
  const monday = (d: string): string => {
    const dt = new Date(`${d}T00:00:00Z`);
    return addDaysStr(d, -((dt.getUTCDay() + 6) % 7));
  };
  switch (p) {
    case "yesterday": return { from: addDaysStr(today, -1), to: addDaysStr(today, -1) };
    case "7d": return { from: addDaysStr(today, -6), to: today };
    case "30d": return { from: addDaysStr(today, -29), to: today };
    case "week": return { from: monday(today), to: today };
    case "lastweek": { const m = monday(today); return { from: addDaysStr(m, -7), to: addDaysStr(m, -1) }; }
    case "month": return { from: `${today.slice(0, 8)}01`, to: today };
    case "lastmonth": {
      const first = `${today.slice(0, 8)}01`;
      const last = addDaysStr(first, -1);
      return { from: `${last.slice(0, 8)}01`, to: last };
    }
    case "year": return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "custom": {
      let from = cFrom || today;
      let to = cTo || today;
      if (to > today) to = today;
      if (from > to) from = to;
      return { from, to };
    }
    default: return { from: today, to: today };
  }
}
export function fmtDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
export function fmtRangeDates(r: { from: string; to: string }): string {
  if (r.from === r.to) return fmtDay(r.from);
  const f = new Date(`${r.from}T00:00:00Z`);
  const t = new Date(`${r.to}T00:00:00Z`);
  if (f.getUTCFullYear() === t.getUTCFullYear() && f.getUTCMonth() === t.getUTCMonth())
    return `${f.getUTCDate()}–${t.getUTCDate()} ${t.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}`;
  return `${fmtDay(r.from)} – ${fmtDay(r.to)}`;
}

// Financial performance chart series (PRIME Phase 1): toggleable, all
// on by default; at least one stays on. Codes keep the per-bucket
// value string short at 390px.
export type FinSeries = "deposits" | "payouts" | "commGen" | "commPaid";
export const FIN_SERIES: { id: FinSeries; label: string; code: string }[] = [
  { id: "deposits", label: "Deposits", code: "D" },
  { id: "payouts", label: "Payouts", code: "P" },
  { id: "commGen", label: "Comm generated", code: "G" },
  { id: "commPaid", label: "Comm paid", code: "C" },
];
