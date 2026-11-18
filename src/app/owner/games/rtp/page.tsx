// Owner RTP monitor (Phase 2) — split out of the old one-page owner panel
// (src/app/owner/legacy/page.tsx). Same sections, same endpoints, same
// behaviour — now its own route, loading only its own data.
"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtMoney } from "../../../../lib/api";
import { todayStr } from "../../../../lib/admin-client";
import { useStore } from "../../../../lib/store";
import { useOwner } from "../../../../components/owner/OwnerContext";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";

export default function OwnerRtpPage() {
  const { user } = useStore();
  const { fiat } = useOwner();
  // P1 Batch 3 (O16/O17): revenue breakdowns + RTP monitor — one shared
  // period, so the two sections always agree on the dates they show.
  interface RtpRow { slug: string; name: string; currency: string; rounds: number; stakes: number; payouts: number; actualRtp: number | null; baseRtp: number | null; status: string }
  const [anPreset, setAnPreset] = useState<"today" | "week" | "month" | "custom">("month");
  const [anFrom, setAnFrom] = useState("");
  const [anTo, setAnTo] = useState("");
  const [rtp, setRtp] = useState<{ from: string; to: string; rows: RtpRow[] } | null>(null);

  // P1 Batch 3 (O18): the same signal labels as the admin fraud page.
  const rtpStatusLabel = (s: string) =>
    s === "flagged-over" ? "OVER-PAYING" : s === "flagged-under" ? "UNDER-PAYING" : s === "ok" ? "OK" : s === "small-sample" ? "Too few rounds" : "Skill — no base";

  const loadSplit = useCallback(async () => {
    const today = todayStr();
    let from = today;
    let to = today;
    if (anPreset === "week") {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 6);
      from = d.toISOString().slice(0, 10);
    } else if (anPreset === "month") {
      from = `${today.slice(0, 8)}01`;
    } else if (anPreset === "custom") {
      from = anFrom || today;
      to = anTo || today;
    }
    try {
      setRtp(await api<{ from: string; to: string; rows: RtpRow[] }>(`/api/owner/rtp?from=${from}&to=${to}`));
    } catch { setRtp(null); }
  }, [anPreset, anFrom, anTo]);
  useEffect(() => { if (user) void loadSplit(); }, [loadSplit, user]);
  return (
    <div>
      <PageHeader title="RTP monitor" sub="Actual vs base RTP per game." />
      <OwnerRangeBar />
      <div className="money-chips" role="group" aria-label="Analytics period">
        {(["today", "week", "month", "custom"] as const).map((p) => (
          <button key={p} type="button" className={anPreset === p ? "on" : ""} onClick={() => setAnPreset(p)}>
            {p === "today" ? "Today" : p === "week" ? "Last 7 days" : p === "month" ? "This month" : "Custom"}
          </button>
        ))}
      </div>
      {anPreset === "custom" && (
        <div className="money-dates">
          <label>From <input type="date" value={anFrom} max={todayStr()} onChange={(e) => setAnFrom(e.target.value)} /></label>
          <label>To <input type="date" value={anTo} max={todayStr()} onChange={(e) => setAnTo(e.target.value)} /></label>
        </div>
      )}

      <section className="admin-sec">
      <h3>RTP monitor</h3>
      {rtp === null ? <p>Loading RTP…</p> : (
        <div className="rg48-twrap">
          <table className="dep-table">
            <thead><tr><th>Game</th><th>Rounds</th><th>Stakes</th><th>Payouts</th><th>Actual RTP</th><th>Base RTP</th><th>Status</th></tr></thead>
            <tbody>
              {rtp.rows.map((r) => (
                <tr key={r.slug}>
                  <td>{r.name} <span className="ow-game-cur">{r.currency === "coins" ? "Coins" : "Cash"}</span></td>
                  <td>{r.rounds}</td>
                  <td>{r.currency === "coins" ? `${Math.round(r.stakes)} coins` : fmtMoney(r.stakes, fiat)}</td>
                  <td>{r.currency === "coins" ? `${Math.round(r.payouts)} coins` : fmtMoney(r.payouts, fiat)}</td>
                  <td>{r.actualRtp === null ? "—" : `${r.actualRtp.toFixed(1)}%`}</td>
                  <td>{r.baseRtp === null ? "Skill" : `${r.baseRtp}%`}</td>
                  <td><span className={`p1b3-flag${r.status === "flagged-over" ? " p1b3-flag-over" : r.status === "flagged-under" ? " p1b3-flag-under" : r.status === "ok" ? " p1b3-flag-ok" : ""}`}>{rtpStatusLabel(r.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </section>
    </div>
  );
}
