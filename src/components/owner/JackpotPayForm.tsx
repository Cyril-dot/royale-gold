import { useState } from "react";
import { api, fmtMoney } from "../../lib/api";
import { useStore } from "../../lib/store";

// P2 Batch 2 (O29): the jackpot pay form — the owner searches a
// player by name/email/phone (the owner's global player search), picks
// one, gives a reason, and pays the whole pot as a bonus. The pot then
// resets to the seed amount.
export function JackpotPayForm({ jackpot, busy, onPay }: {
  jackpot: { id: string; name: string; currentPot: number };
  busy: boolean;
  onPay: (jackpotId: string, userId: string, reason: string) => Promise<void>;
}) {
  const { toast } = useStore();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; email: string | null; phone: string | null }[]>([]);
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [reason, setReason] = useState("");
  const search = async () => {
    if (q.trim().length < 2) { toast("Search needs at least 2 characters", "lose"); return; }
    try {
      const r = await api<{ players: { id: string; name: string; email: string | null; phone: string | null; role: string }[] }>(`/api/owner/players/search?q=${encodeURIComponent(q.trim())}`);
      setResults(r.players.filter((p) => p.role === "user"));
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Search failed", "lose");
    }
  };
  return (
    <div className="pd-adjust-row ow-stack">
      {picked ? (
        <span>Pay to: <b>{picked.name}</b> <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setPicked(null); setQ(""); setResults([]); }}>Change</button></span>
      ) : (
        <>
          <label>Player (name / email / phone)
            <input type="text" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void search(); } }} placeholder="Search players" aria-label={`Search a player to pay the ${jackpot.name} jackpot to`} />
          </label>
          <button className="btn btn-ghost" type="button" onClick={() => void search()}>Search</button>
          {results.length > 0 && (
            <span>{results.map((p) => (
              <button key={p.id} className="btn btn-ghost btn-sm" type="button" onClick={() => { setPicked({ id: p.id, name: p.name }); setResults([]); }}>{p.name}{p.email ? ` (${p.email})` : p.phone ? ` (${p.phone})` : ""}</button>
            ))}</span>
          )}
        </>
      )}
      <label>Reason (optional)
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Why this player" aria-label={`Reason for paying the ${jackpot.name} jackpot`} />
      </label>
      <button className="btn btn-gold" type="button" disabled={busy || !picked || jackpot.currentPot <= 0} onClick={() => picked && void onPay(jackpot.id, picked.id, reason.trim())}>{busy ? "Paying…" : `Pay ${fmtMoney(jackpot.currentPot, "GHS")}`}</button>
    </div>
  );
}
