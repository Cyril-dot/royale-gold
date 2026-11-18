// Admin dashboard — Bet lookup + provably-fair verify (Phase 6 restyle).
// Three tools on one page:
//   1. Look up ANY round by its id (game, stake, payout, result, date).
//   2. Look up a player's rounds in a date range.
//   3. Verify a crash round: recompute the crash point from the revealed
//      server seed and compare the seed hash — the seed is returned only
//      for a FINISHED round, never a live one.
// Restyle only — no new lookup powers. Ids, seeds and hashes now have
// Copy buttons; player contacts are masked with audited Reveal.
"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "../../../lib/store";
import { api, fmtMoney } from "../../../lib/api";
import { todayStr } from "../../../lib/money";
import { useStaffFetch } from "../../../components/staff-ui/useStaffFetch";
import { PageHeader } from "../../../components/staff-ui/PageHeader";
import { Card } from "../../../components/staff-ui/Card";
import { DataTable, type DataColumn } from "../../../components/staff-ui/DataTable";
import { Button } from "../../../components/staff-ui/Button";
import { Input, Select, FormField } from "../../../components/staff-ui/Form";
import { CopyButton } from "../../../components/staff-ui/CopyButton";
import { Skeleton, ErrorState } from "../../../components/staff-ui/Feedback";
import { AdminContactValue } from "../../../components/admin/AdminReveal";
import { canAccessSection } from "../../../lib/rbac";

interface LookupRound {
  id: string;
  userId: string;
  userName: string;
  userContact: string | null;
  game: string;
  gameName: string;
  currency: string;
  fiatCurrency: string;
  stake: number;
  payout: number;
  net: number;
  result: unknown;
  createdAt: string;
}

interface VerifyResult {
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

interface RecentRound {
  roundId: string;
  hash: string;
  crashPoint: number;
  createdAt: string;
  finished: boolean;
}

interface LookupPlayer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export default function AdminLookupPage() {
  return (
    <Suspense fallback={<Skeleton lines={6} title />}>
      <AdminLookupInner />
    </Suspense>
  );
}

function moneyOrCoins(r: LookupRound, n: number, signed: boolean, fiat: string): string {
  if (r.currency === "coins") return `${signed && n >= 0 ? "+" : ""}${Math.round(n)} coins`;
  const abs = fmtMoney(Math.abs(n), r.fiatCurrency ?? fiat);
  if (!signed) return abs;
  return n >= 0 ? `+${abs}` : `−${abs}`;
}

function AdminLookupInner() {
  const { user } = useStore();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const preview = !!previewId;
  const fiat = user?.currency ?? "GHS";

  const playersUrl = useMemo(() => {
    if (!user) return null;
    return previewId ? `/api/admin/players/segments?adminId=${previewId}` : "/api/admin/players";
  }, [user, previewId]);
  const playersFetch = useStaffFetch<{ players?: LookupPlayer[]; referredUsers?: LookupPlayer[] }>(playersUrl);
  const players = playersFetch.data?.players ?? playersFetch.data?.referredUsers ?? [];

  const [roundId, setRoundId] = useState("");
  const [round, setRound] = useState<LookupRound | null>(null);
  const [roundErr, setRoundErr] = useState("");
  const [roundBusy, setRoundBusy] = useState(false);

  const [lookupUser, setLookupUser] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [playerRounds, setPlayerRounds] = useState<LookupRound[] | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [playerErr, setPlayerErr] = useState("");
  const [playerBusy, setPlayerBusy] = useState(false);

  const [verifyId, setVerifyId] = useState("");
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [verifyErr, setVerifyErr] = useState("");
  const [verifyBusy, setVerifyBusy] = useState(false);

  const [recent, setRecent] = useState<RecentRound[] | null>(null);
  const [recentErr, setRecentErr] = useState("");
  const [recentBusy, setRecentBusy] = useState(false);

  if (!user) return null;
  if (!previewId && !canAccessSection(user, "lookup")) {
    return (
      <ErrorState
        title="No access to this section."
        text="You do not have access to the Lookup section. Ask the owner to grant you access from the Owner panel."
      />
    );
  }

  const withPreview = (href: string) => (previewId ? `${href}?preview=${previewId}` : href);
  const adminSuffix = previewId ? `&adminId=${previewId}` : "";

  const lookupRound = async () => {
    const id = roundId.trim();
    if (!id) {
      setRoundErr("Enter a round id.");
      return;
    }
    setRoundBusy(true);
    setRoundErr("");
    try {
      const r = await api<{ round: LookupRound }>(`/api/admin/lookup?roundId=${encodeURIComponent(id)}${adminSuffix}`);
      setRound(r.round);
    } catch (ex) {
      setRound(null);
      setRoundErr(ex instanceof Error ? ex.message : "Lookup failed.");
    } finally {
      setRoundBusy(false);
    }
  };

  const lookupPlayer = async () => {
    if (!lookupUser) {
      setPlayerErr("Pick a player.");
      return;
    }
    setPlayerBusy(true);
    setPlayerErr("");
    try {
      const p = new URLSearchParams();
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      const qs = p.toString();
      const r = await api<{ player: { id: string; name: string }; rounds: LookupRound[] }>(
        `/api/admin/lookup?userId=${lookupUser}${qs ? `&${qs}` : ""}${adminSuffix}`,
      );
      setPlayerRounds(r.rounds);
      setPlayerName(r.player.name);
    } catch (ex) {
      setPlayerRounds(null);
      setPlayerErr(ex instanceof Error ? ex.message : "Lookup failed.");
    } finally {
      setPlayerBusy(false);
    }
  };

  const verifyRound = async (id?: string) => {
    const rid = (id ?? verifyId).trim();
    if (!rid) {
      setVerifyErr("Enter a crash round id.");
      return;
    }
    setVerifyBusy(true);
    setVerifyErr("");
    try {
      setVerifyId(rid);
      const r = await api<VerifyResult>(`/api/admin/lookup/verify?roundId=${encodeURIComponent(rid)}`);
      setVerify(r);
    } catch (ex) {
      setVerify(null);
      setVerifyErr(ex instanceof Error ? ex.message : "Verify failed.");
    } finally {
      setVerifyBusy(false);
    }
  };

  const loadRecent = async () => {
    setRecentErr("");
    setRecentBusy(true);
    try {
      const r = await api<{ rounds: RecentRound[] }>("/api/admin/lookup/recent-rounds");
      setRecent(r.rounds);
    } catch (ex) {
      setRecentErr(ex instanceof Error ? ex.message : "Could not load recent rounds.");
    } finally {
      setRecentBusy(false);
    }
  };

  const roundColumns: DataColumn<LookupRound>[] = [
    {
      key: "game",
      label: "Game",
      render: (r) => r.gameName,
    },
    {
      key: "stake",
      label: "Stake",
      render: (r) => moneyOrCoins(r, r.stake, false, fiat),
      details: (r) => [["Stake", moneyOrCoins(r, r.stake, false, fiat)]],
    },
    {
      key: "net",
      label: "Net",
      render: (r) => (
        <span className={r.net >= 0 ? "st-ok-text" : "st-bad-text"}>{moneyOrCoins(r, r.net, true, fiat)}</span>
      ),
      details: (r) => [["Net", moneyOrCoins(r, r.net, true, fiat)]],
    },
    {
      key: "time",
      label: "Time",
      render: (r) =>
        new Date(r.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
      details: (r) => [
        [
          "Time",
          new Date(r.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
        ],
      ],
    },
  ];

  const recentColumns: DataColumn<RecentRound>[] = [
    {
      key: "point",
      label: "Crash point",
      render: (r) => `×${r.crashPoint.toFixed(2)}`,
    },
    {
      key: "status",
      label: "Status",
      render: (r) => (r.finished ? "Finished" : "Live"),
      details: (r) => [["Status", r.finished ? "Finished" : "Live"]],
    },
    {
      key: "round",
      label: "Round",
      render: (r) => <code>{r.roundId.slice(0, 12)}…</code>,
      details: (r) => [["Round", r.roundId]],
    },
    {
      key: "time",
      label: "Time",
      render: (r) =>
        new Date(r.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
      details: (r) => [
        [
          "Time",
          new Date(r.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
        ],
      ],
    },
  ];

  return (
    <div>
      <PageHeader
        title="Bet lookup"
        sub="Look up any round by its id, or a player's rounds by date. Crash rounds can be verified against their seed hash below."
        backHref={withPreview("/admin")}
        backLabel="Overview"
      />

      <Card title="Look up a round">
        <div className="st-form-row">
          <FormField label="Round id">
            <Input
              type="text"
              placeholder="Round id (from the player's bet history)"
              value={roundId}
              onChange={(e) => setRoundId(e.target.value)}
              aria-label="Round id"
            />
          </FormField>
        </div>
        <Button loading={roundBusy} onClick={() => void lookupRound()}>
          Look up
        </Button>
        {roundErr ? (
          <p className="st-field-error" role="alert">
            {roundErr}
          </p>
        ) : null}
        {round ? (
          <div style={{ marginTop: 12 }}>
            <div className="st-kpi-grid">
              <div className="st-kpi st-kpi-static">
                <span className="st-kpi-label">Game</span>
                <span className="st-kpi-value">{round.gameName}</span>
              </div>
              <div className="st-kpi st-kpi-static">
                <span className="st-kpi-label">Stake</span>
                <span className="st-kpi-value">{moneyOrCoins(round, round.stake, false, fiat)}</span>
              </div>
              <div className="st-kpi st-kpi-static">
                <span className="st-kpi-label">Payout</span>
                <span className="st-kpi-value">{moneyOrCoins(round, round.payout, false, fiat)}</span>
              </div>
              <div className="st-kpi st-kpi-static">
                <span className="st-kpi-label">Net</span>
                <span className="st-kpi-value">{moneyOrCoins(round, round.net, true, fiat)}</span>
              </div>
            </div>
            <p>
              Player: {round.userName}{" "}
              <AdminContactValue userId={round.userId} contact={round.userContact} preview={preview} /> ·{" "}
              {new Date(round.createdAt).toLocaleString("en-GB")}
            </p>
            <p>
              Round id: <code className="st-mono">{round.id}</code> <CopyButton text={round.id} label="Copy round id" />
            </p>
            <pre className="st-pre">{JSON.stringify(round.result, null, 2)}</pre>
          </div>
        ) : null}
      </Card>

      <Card title="Look up a player's rounds">
        <div className="st-form-row st-form-row-2">
          <FormField label="Player">
            <Select value={lookupUser} onChange={(e) => setLookupUser(e.target.value)} aria-label="Player">
              <option value="">Pick a player…</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.email ? ` — ${p.email}` : ""}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="From">
            <Input type="date" value={from} max={todayStr()} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          </FormField>
          <FormField label="To">
            <Input type="date" value={to} max={todayStr()} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          </FormField>
        </div>
        <Button loading={playerBusy} onClick={() => void lookupPlayer()}>
          Look up
        </Button>
        {playerErr ? (
          <p className="st-field-error" role="alert">
            {playerErr}
          </p>
        ) : null}
        {playersFetch.err ? (
          <p className="st-field-error" role="alert">
            {playersFetch.err}
          </p>
        ) : null}
        {playerRounds !== null ? (
          playerRounds.length === 0 ? (
            <p>No rounds for {playerName} in that range.</p>
          ) : (
            <div style={{ marginTop: 12 }}>
              <DataTable<LookupRound>
                viewId="admin-lookup-player"
                columns={roundColumns}
                rows={playerRounds}
                total={playerRounds.length}
                page={1}
                pageSize={25}
                onPageChange={() => {}}
                emptyTitle="No rounds."
                emptyText="No rounds for this player in that range."
                onSelect={(r) => {
                  setRoundId(r.id);
                  setRound(r);
                  setRoundErr("");
                }}
              />
            </div>
          )
        ) : null}
      </Card>

      <Card
        title="Provably-fair verify (crash games)"
        sub="The seed is revealed only for a finished round — a live round's seed stays secret."
      >
        <div className="st-form-row">
          <FormField label="Crash round id">
            <Input
              type="text"
              placeholder="Crash round id"
              value={verifyId}
              onChange={(e) => setVerifyId(e.target.value)}
              aria-label="Crash round id"
            />
          </FormField>
        </div>
        <Button loading={verifyBusy} onClick={() => void verifyRound()}>
          Verify
        </Button>
        {verifyErr ? (
          <p className="st-field-error" role="alert">
            {verifyErr}
          </p>
        ) : null}
        {verify ? (
          <div style={{ marginTop: 12 }}>
            <p>
              Round id: <code className="st-mono">{verify.roundId}</code> <CopyButton text={verify.roundId} label="Copy round id" />
            </p>
            <p>
              Issued hash: <code className="st-mono">{verify.hash}</code> <CopyButton text={verify.hash} label="Copy hash" />
            </p>
            <p>
              Client seed: <code className="st-mono">{verify.clientSeed}</code> <CopyButton text={verify.clientSeed} label="Copy client seed" /> · Nonce:{" "}
              {verify.nonce}
            </p>
            {!verify.finished ? (
              <p>
                <b>This round is still live</b> — the seed is revealed only after it finishes.
              </p>
            ) : (
              <>
                <p>
                  Server seed: <code className="st-mono">{verify.serverSeed}</code>{" "}
                  {verify.serverSeed ? <CopyButton text={verify.serverSeed} label="Copy server seed" /> : null}
                </p>
                <p>
                  Crash point: ×{verify.crashPoint?.toFixed(2)} · Recomputed: ×{verify.recomputedPoint?.toFixed(2)}
                </p>
                <p className={verify.pointMatch ? "st-ok-text" : "st-bad-text"}>
                  Crash point: {verify.pointMatch ? "MATCHES — the round was fair" : "DOES NOT MATCH"}
                </p>
                <p className={verify.hashMatch ? "st-ok-text" : "st-bad-text"}>
                  Seed hash: {verify.hashMatch ? "MATCHES — the seed is the one issued" : "DOES NOT MATCH"}
                </p>
              </>
            )}
          </div>
        ) : null}
        <h4 style={{ marginTop: 16 }}>Recent crash rounds</h4>
        {recent === null ? (
          <Button variant="secondary" loading={recentBusy} onClick={() => void loadRecent()}>
            Load recent rounds
          </Button>
        ) : recent.length === 0 ? (
          <p>No crash rounds issued yet — play a crash game (Aviator Gold, Jet Fly, Car Crash, Balloon Burst) and come back.</p>
        ) : (
          <div style={{ marginTop: 12 }}>
            <DataTable<RecentRound & { id: string }>
              viewId="admin-lookup-recent"
              columns={recentColumns as DataColumn<RecentRound & { id: string }>[]}
              rows={recent.map((r) => ({ ...r, id: r.roundId }))}
              total={recent.length}
              page={1}
              pageSize={25}
              onPageChange={() => {}}
              emptyTitle="No crash rounds."
              emptyText="No crash rounds issued yet."
              onSelect={(r) => void verifyRound(r.roundId)}
            />
          </div>
        )}
        {recentErr ? (
          <p className="st-field-error" role="alert">
            {recentErr}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
