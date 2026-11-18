// Owner Game replays (Phase 4 restyle) — split out of the old one-page
// owner panel (deleted in Phase 4). Same endpoints, same
// behaviour: the 50 most recent GameResult rows + a detail view (the
// round's outcome + the provably-fair verify for crash rounds). No
// per-bet event log exists, so a replay shows the outcome + the verify
// result, not a step-by-step animation — the page says so plainly.
// Staff-ui throughout: DataTable (search / sort / pagination, CardList
// on phone), detail in the shared Dialog, and the player's contact
// masked by default behind MaskedValue + the audited reveal endpoint
// (kind "user-contact", keyed by user id).
"use client";

import { useMemo, useState, type ReactNode } from "react";
import { api } from "../../../../lib/api";
import { useStore } from "../../../../lib/store";
import { useOwner } from "../../../../components/owner/OwnerContext";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { Card } from "../../../../components/staff-ui/Card";
import { Button } from "../../../../components/staff-ui/Button";
import { Badge } from "../../../../components/staff-ui/Badge";
import { DataTable, type DataColumn, type DataRowAction } from "../../../../components/staff-ui/DataTable";
import { Dialog } from "../../../../components/staff-ui/Dialog";
import { MaskedValue } from "../../../../components/staff-ui/MaskedValue";
import { fmtStaffMoney, fmtStaffInt } from "../../../../components/staff-ui/format";
import { useOwnerFetch } from "../../../../components/owner/useOwnerFetch";

interface ReplayRow {
  id: string;
  userId: string;
  userName: string;
  game: string;
  gameName: string;
  currency: string;
  fiatCurrency: string;
  stake: number;
  payout: number;
  net: number;
  roundId: string | null;
  createdAt: string;
}

interface ReplayVerify {
  roundId: string;
  hash: string;
  clientSeed: string;
  nonce: number;
  finished: boolean;
  serverSeed?: string;
  crashPoint?: number;
  recomputedPoint?: number;
  pointMatch?: boolean;
  hashMatch?: boolean;
}

interface ReplayDetail {
  replay: ReplayRow & { userContact: string | null };
  verify: ReplayVerify | null;
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function OwnerReplaysPage() {
  const { user, toast } = useStore();
  const { fiat } = useOwner();
  const [detail, setDetail] = useState<ReplayDetail | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const pageSize = 25;

  const url = useMemo(() => (user ? "/api/owner/replays" : null), [user]);
  const { data, err, loading, reload } = useOwnerFetch<{ replays: ReplayRow[] }>(url);

  const money = (r: ReplayRow, n: number) =>
    r.currency === "coins" ? `${fmtStaffInt(n)} coins` : fmtStaffMoney(n, r.fiatCurrency ?? fiat);

  const rows = useMemo(() => {
    const all = data?.replays ?? [];
    const needle = search.trim().toLowerCase();
    const kept = all.filter(
      (r) => !needle || r.gameName.toLowerCase().includes(needle) || r.userName.toLowerCase().includes(needle),
    );
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (r: ReplayRow): number => {
      if (sortKey === "stake") return r.stake;
      if (sortKey === "payout") return r.payout;
      if (sortKey === "net") return r.net;
      return new Date(r.createdAt).getTime();
    };
    return [...kept].sort((a, b) => (val(a) - val(b)) * dir);
  }, [data, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const onSort = (key: string) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(1);
  };

  const openReplay = async (id: string) => {
    setBusyId(id);
    try {
      setDetail(await api<ReplayDetail>(`/api/owner/replays/${id}`));
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not open the replay", "lose");
    } finally {
      setBusyId(null);
    }
  };

  const rowActions: DataRowAction<ReplayRow>[] = [
    {
      label: "View",
      onClick: (r) => void openReplay(r.id),
      disabled: (r) => busyId === r.id,
    },
  ];

  const columns: DataColumn<ReplayRow>[] = [
    {
      key: "game",
      label: "Game",
      render: (r) => r.gameName,
      sub: (r) => r.userName,
    },
    {
      key: "createdAt",
      label: "Time",
      sortable: true,
      render: (r) => fmtDate(r.createdAt),
      details: (r): [string, ReactNode][] => [["Time", fmtDate(r.createdAt)]],
    },
    {
      key: "stake",
      label: "Stake",
      sortable: true,
      render: (r) => money(r, r.stake),
      details: (r): [string, ReactNode][] => [["Stake", money(r, r.stake)]],
    },
    {
      key: "payout",
      label: "Payout",
      sortable: true,
      render: (r) => money(r, r.payout),
      details: (r): [string, ReactNode][] => [["Payout", money(r, r.payout)]],
    },
    {
      key: "net",
      label: "Net",
      sortable: true,
      render: (r) => `${r.net > 0 ? "+" : ""}${money(r, r.net)}`,
      details: (r): [string, ReactNode][] => [["Net", `${r.net > 0 ? "+" : ""}${money(r, r.net)}`]],
    },
  ];

  const d = detail?.replay;
  const v = detail?.verify;
  const contact = d?.userContact ?? null;

  return (
    <div>
      <PageHeader title="Game replays" sub="The 50 most recent rounds." />
      <OwnerRangeBar />
      <Card
        title="Game replays"
        sub="A replay shows the round's outcome and the provably-fair result, not a step-by-step animation — no per-bet event log exists."
      >
        <DataTable<ReplayRow>
          viewId="owner-replays"
          columns={columns}
          rows={pageRows}
          total={rows.length}
          page={safePage}
          pageSize={pageSize}
          onPageChange={(p) => setPage(p)}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={onSort}
          search={search}
          onSearchChange={(q) => { setSearch(q); setPage(1); }}
          searchPlaceholder="Search game or player…"
          loading={loading}
          error={err}
          onRetry={reload}
          emptyTitle="No rounds yet."
          emptyText="No rounds match the current search."
          rowActions={rowActions}
        />
      </Card>
      <Dialog open={detail !== null} onClose={() => setDetail(null)} title={d ? d.gameName : "Replay"}>
        {d ? (
          <div>
            <p>
              {d.userName}
              {contact ? (
                <>
                  {" · "}
                  <MaskedValue
                    value={contact}
                    kind={contact.includes("@") ? "email" : "phone"}
                    label="Player contact"
                    onReveal={async () => {
                      const r = await api<{ value: { email: string | null; phone: string | null } }>("/api/owner/reveal", {
                        method: "POST",
                        body: JSON.stringify({ kind: "user-contact", id: d.userId }),
                      });
                      return contact.includes("@") ? r.value.email : r.value.phone;
                    }}
                  />
                </>
              ) : null}
            </p>
            <p>{fmtDate(d.createdAt)}</p>
            <dl className="st-dialog-facts">
              <div style={{ display: "contents" }}>
                <dt>Stake</dt>
                <dd>{money(d, d.stake)}</dd>
              </div>
              <div style={{ display: "contents" }}>
                <dt>Payout</dt>
                <dd>{money(d, d.payout)}</dd>
              </div>
              <div style={{ display: "contents" }}>
                <dt>Net</dt>
                <dd>{`${d.net > 0 ? "+" : ""}${money(d, d.net)}`}</dd>
              </div>
              {d.roundId ? (
                <div style={{ display: "contents" }}>
                  <dt>Round</dt>
                  <dd>{d.roundId.slice(0, 8)}…</dd>
                </div>
              ) : null}
            </dl>
            {v ? (
              <div>
                <p>Provably-fair verify</p>
                <div className="st-chip-row" role="group" aria-label="Verify results">
                  <Badge variant={v.pointMatch ? "ok" : "danger"}>
                    Crash point ×{v.crashPoint} · recomputed ×{v.recomputedPoint} · {v.pointMatch ? "matches" : "does not match"}
                  </Badge>
                  <Badge variant={v.hashMatch ? "ok" : "danger"}>
                    Hash {v.hashMatch ? "matches" : "does not match"}
                  </Badge>
                </div>
                {v.finished ? null : <p>Round still live — the seed is revealed only once it finishes.</p>}
              </div>
            ) : (
              <p>No provably-fair verify for this round — only crash rounds carry a seed + hash.</p>
            )}
            <Button variant="ghost" onClick={() => setDetail(null)}>
              Close replay
            </Button>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
