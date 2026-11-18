// Admin dashboard — Overview (Phase 5 restyle). Attention first: the
// pending queues (withdrawals, KYC, tickets, fraud) from the new
// GET /api/admin/attention, then the commission summary, today so far,
// the 7-day deposits chart and top players — all real data, one fiat at
// a time. Same endpoints and behaviour as before, staff-ui throughout.
// The admin's own email is not printed in the header (D1: masked by
// default — and it is the signed-in admin's own identity, not another
// player's contact, so there is nothing to reveal here).
"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "../../lib/store";
import { api } from "../../lib/api";
import CurrencyChips from "../../components/CurrencyChips";
import { useStaffFetch } from "../../components/staff-ui/useStaffFetch";
import { PageHeader } from "../../components/staff-ui/PageHeader";
import { Card, KpiTile } from "../../components/staff-ui/Card";
import { DataTable, type DataColumn } from "../../components/staff-ui/DataTable";
import { BarChart, CHART_COLORS } from "../../components/staff-ui/Charts";
import { ConfirmDialog } from "../../components/staff-ui/Dialog";
import { Button } from "../../components/staff-ui/Button";
import { Input } from "../../components/staff-ui/Form";
import { Skeleton, EmptyState, ErrorState } from "../../components/staff-ui/Feedback";
import { fmtStaffMoney } from "../../components/staff-ui/format";
import { AdminContactValue } from "../../components/admin/AdminReveal";
import { canAccessSection } from "../../lib/rbac";
import type { AdminDashboardData, AdminOverview, SentNotificationRow } from "../../lib/admin-client";

interface Attention {
  currency: string;
  withdrawals?: { pending: number; held: number; awaitingOwner: number; actionable: number };
  kycPending?: number;
  tickets?: { open: number; answered: number; needingAttention: number };
  fraud?: { high: number; medium: number };
}

export default function AdminOverviewPage() {
  return (
    <Suspense fallback={<Skeleton lines={6} title />}>
      <AdminOverviewInner />
    </Suspense>
  );
}

function AdminOverviewInner() {
  const { user, toast } = useStore();
  const router = useRouter();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const [fiatSel, setFiatSel] = useState<string | null>(null);
  const fiat = fiatSel ?? user?.currency ?? "GHS";
  const [bcTitle, setBcTitle] = useState("");
  const [bcBody, setBcBody] = useState("");
  const [bcBusy, setBcBusy] = useState(false);
  const [bcConfirm, setBcConfirm] = useState(false);

  const ovUrl = useMemo(() => {
    if (!user) return null;
    const base = previewId ? `/api/owner/admins/${previewId}/preview` : "/api/admin/overview";
    return `${base}${base.includes("?") ? "&" : "?"}currency=${encodeURIComponent(fiat)}`;
  }, [user, previewId, fiat]);
  const dashUrl = useMemo(() => {
    if (!user) return null;
    const base = previewId ? `/api/owner/dashboard?adminId=${previewId}` : "/api/admin/dashboard";
    return `${base}${base.includes("?") ? "&" : "?"}currency=${encodeURIComponent(fiat)}`;
  }, [user, previewId, fiat]);
  const attentionUrl = useMemo(() => {
    if (!user) return null;
    const base = previewId ? `/api/admin/attention?adminId=${previewId}` : "/api/admin/attention";
    return `${base}${base.includes("?") ? "&" : "?"}currency=${encodeURIComponent(fiat)}`;
  }, [user, previewId, fiat]);
  const sentUrl = useMemo(() => {
    if (!user) return null;
    return previewId ? `/api/owner/notifications?adminId=${previewId}` : "/api/admin/notifications";
  }, [user, previewId]);

  const { data: ov, err: ovErr, loading: ovLoading, reload: reloadOv } = useStaffFetch<AdminOverview>(ovUrl);
  const { data: dash, err: dashErr } = useStaffFetch<AdminDashboardData>(dashUrl);
  const { data: attention, err: attErr, loading: attLoading, reload: reloadAtt } = useStaffFetch<Attention>(attentionUrl);
  const { data: sentData, reload: reloadSent } = useStaffFetch<{ sent: SentNotificationRow[] }>(sentUrl);

  // The shell shows the login prompt when signed out and the
  // not-an-admin state for players — pages render nothing until then.
  if (!user) return null;
  if (!previewId && !canAccessSection(user, "overview")) {
    return (
      <ErrorState
        title="No access to this section."
        text="You do not have access to the Overview section. Ask the owner to grant you access from the Owner panel."
      />
    );
  }
  if (ovErr) return <ErrorState text={ovErr} onRetry={reloadOv} />;
  if (ovLoading || !ov) return <Skeleton lines={6} title />;

  const href = (p: string) => (previewId ? `${p}?preview=${previewId}` : p);
  const commissionHref = (date: string) =>
    previewId
      ? `/admin/commission?preview=${previewId}&date=${date}&currency=${fiat}`
      : `/admin/commission?date=${date}&currency=${fiat}`;
  const c = ov.commission;
  // DataTable rows need an id — the history day is its own key.
  const latest = ov.history.slice(0, 5).map((d) => ({ ...d, id: d.date }));
  const att = attention;
  const attentionTotal =
    (att?.withdrawals?.actionable ?? 0) + (att?.kycPending ?? 0) + (att?.tickets?.needingAttention ?? 0) + (att?.fraud?.high ?? 0);

  const submitBroadcast = async () => {
    if (bcTitle.trim().length < 2 || bcBody.trim().length < 2) {
      toast("Write a title and a message first", "lose");
      return;
    }
    setBcBusy(true);
    try {
      const r = await api<{ sent: number }>("/api/admin/notifications", {
        method: "POST",
        body: JSON.stringify({ title: bcTitle.trim(), body: bcBody.trim() }),
      });
      toast(`Notification sent to ${r.sent} players`, "win");
      setBcTitle("");
      setBcBody("");
      setBcConfirm(false);
      reloadSent();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Broadcast failed", "lose");
    } finally {
      setBcBusy(false);
    }
  };

  const topColumns: DataColumn<AdminDashboardData["topPlayers"][number]>[] = [
    {
      key: "player",
      label: "Player",
      render: (p) => p.name,
      sub: (p) => <AdminContactValue userId={p.id} contact={p.contact} preview={!!previewId} />,
    },
    { key: "deposits", label: "Deposits", render: (p) => String(p.deposits) },
    {
      key: "total",
      label: "Total deposited",
      render: (p) => fmtStaffMoney(p.totalDeposited, dash?.currency ?? fiat),
    },
  ];
  const dayColumns: DataColumn<(typeof latest)[number]>[] = [
    { key: "date", label: "Date", render: (d) => d.date },
    { key: "deposits", label: "Deposits", render: (d) => String(d.deposits) },
    {
      key: "commission",
      label: "Commission",
      render: (d) => fmtStaffMoney(d.totalCommission, d.fiatCurrency ?? ov.currency ?? fiat),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Overview"
        sub={`${ov.admin.name} · ${ov.admin.commissionPct}% commission${ov.admin.active ? "" : " · DEACTIVATED"}`}
      />
      <CurrencyChips value={fiat} onChange={setFiatSel} label="Commission currency" />

      <Card title="Needs attention" sub="Pending queues in the sections you can access.">
        {attErr ? (
          <ErrorState text={attErr} onRetry={reloadAtt} />
        ) : attLoading || !att ? (
          <Skeleton lines={3} />
        ) : (
          <>
            <div className="st-kpi-grid">
              {att.withdrawals ? (
                <KpiTile
                  label="Pending withdrawals"
                  value={String(att.withdrawals.actionable)}
                  sub={`${att.withdrawals.pending} pending · ${att.withdrawals.held} held · ${att.withdrawals.awaitingOwner} awaiting owner`}
                  href={href("/admin/money/withdrawals")}
                />
              ) : null}
              {att.kycPending !== undefined ? (
                <KpiTile label="KYC queue" value={String(att.kycPending)} sub="Submissions waiting for review" href={href("/admin/kyc")} />
              ) : null}
              {att.tickets ? (
                <KpiTile
                  label="Open tickets"
                  value={String(att.tickets.needingAttention)}
                  sub={`${att.tickets.open} unanswered · ${att.tickets.answered} answered`}
                  href={href("/admin/tickets")}
                />
              ) : null}
              {att.fraud ? (
                <KpiTile
                  label="Fraud — high"
                  value={String(att.fraud.high)}
                  sub={`${att.fraud.medium} medium signals`}
                  href={href("/admin/fraud")}
                />
              ) : null}
            </div>
            {attentionTotal === 0 ? <p>Nothing needs attention right now.</p> : null}
          </>
        )}
      </Card>

      <Card title="Commission summary">
        <div className="st-kpi-grid">
          <KpiTile label="Today" value={fmtStaffMoney(c.today, ov.currency ?? fiat)} />
          <KpiTile label="Yesterday" value={fmtStaffMoney(c.yesterday, ov.currency ?? fiat)} />
          <KpiTile label="Last 7 days" value={fmtStaffMoney(c.last7d, ov.currency ?? fiat)} />
          <KpiTile label="Last 30 days" value={fmtStaffMoney(c.last30d, ov.currency ?? fiat)} />
          <KpiTile label="All time" value={fmtStaffMoney(c.allTime, ov.currency ?? fiat)} />
        </div>
      </Card>

      <Card title="At a glance">
        <div className="st-kpi-grid">
          <KpiTile label="Active codes" value={String(ov.codes.filter((x) => x.active).length)} />
          <KpiTile label="Referred users" value={String(ov.referredUsers.length)} />
          <KpiTile label="Coins given" value={String(ov.coinsGiven)} />
        </div>
      </Card>

      {dash ? (
        <>
          <Card title="Today so far">
            {dash.scope.childAdmins.length > 0 ? (
              <p>Includes your child admins&apos; downlines: {dash.scope.childAdmins.map((x) => x.name).join(", ")}.</p>
            ) : null}
            <div className="st-kpi-grid">
              <KpiTile label="Deposits today" value={String(dash.today.deposits)} />
              <KpiTile label="Deposited today" value={fmtStaffMoney(dash.today.depositsTotal, dash.currency ?? fiat)} />
              <KpiTile label="New players" value={String(dash.today.newPlayers)} />
              <KpiTile label="Active players" value={String(dash.today.activePlayers)} />
              <KpiTile label="Commission today" value={fmtStaffMoney(dash.today.commission, dash.currency ?? fiat)} />
            </div>
          </Card>
          <Card title={`Last 7 days — deposits (${dash.currency ?? fiat})`}>
            <BarChart
              labels={dash.week.map((d) => new Date(`${d.date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" }))}
              series={[{ label: "Deposited", color: CHART_COLORS.gold, values: dash.week.map((d) => d.total) }]}
              formatValue={(v) => fmtStaffMoney(v, dash.currency ?? fiat)}
            />
          </Card>
          <Card title="Top players by deposits">
            {dash.topPlayers.length === 0 ? (
              <EmptyState title="No deposits yet." text="No deposits from your players yet." />
            ) : (
              <DataTable
                viewId="admin-overview-top-players"
                columns={topColumns}
                rows={dash.topPlayers}
                total={dash.topPlayers.length}
                page={1}
                pageSize={5}
                onPageChange={() => undefined}
                rowHref={(p) => href(`/admin/players/${p.id}`)}
              />
            )}
          </Card>
        </>
      ) : dashErr ? (
        <Card title="Today so far">
          <p>Could not load today&apos;s figures.</p>
        </Card>
      ) : (
        <Skeleton lines={4} title />
      )}

      <Card title="Latest commission days">
        {latest.length === 0 ? (
          <EmptyState title="No commission days yet." text="Commission days appear here once your players deposit." />
        ) : (
          <DataTable
            viewId="admin-overview-commission-days"
            columns={dayColumns}
            rows={latest}
            total={latest.length}
            page={1}
            pageSize={5}
            onPageChange={() => undefined}
            rowActions={[{ label: "View", onClick: (d) => router.push(commissionHref(d.date)) }]}
          />
        )}
      </Card>

      <Card title="Notify all my players" sub="In-app only, no email or SMS.">
        {!previewId && user.role === "admin" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setBcConfirm(true);
            }}
          >
            <div className="st-form-row">
              <Input
                type="text"
                placeholder="Title — e.g. Weekend bonus is live"
                value={bcTitle}
                onChange={(e) => setBcTitle(e.target.value)}
                aria-label="Broadcast title"
                maxLength={120}
              />
              <textarea
                className="st-textarea"
                placeholder="Message…"
                value={bcBody}
                onChange={(e) => setBcBody(e.target.value)}
                aria-label="Broadcast message"
                rows={2}
                maxLength={2000}
              />
            </div>
            <div className="st-btn-row" style={{ marginTop: 12 }}>
              <Button variant="primary" type="submit" disabled={bcBusy}>
                {bcBusy ? "Sending…" : "Send to all my players"}
              </Button>
            </div>
          </form>
        ) : null}
        {sentData && sentData.sent.length > 0 ? (
          <>
            <h4>Recently sent</h4>
            <div className="st-tk-thread">
              {sentData.sent.slice(0, 5).map((s) => (
                <div key={s.id} className="st-tk-msg st-tk-msg-user">
                  <b>{s.title}</b>
                  <span>{s.body}</span>
                  <small>
                    {s.userName} · {new Date(s.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {s.readAt ? " · read" : " · unread"}
                  </small>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p>No notifications sent yet.</p>
        )}
      </Card>

      <ConfirmDialog
        open={bcConfirm}
        onClose={() => setBcConfirm(false)}
        onConfirm={() => void submitBroadcast()}
        title="Send broadcast"
        body="This sends the message to every player in your downline at once. It cannot be unsent."
        facts={[
          { label: "Recipients", value: `${ov.referredUsers.length} players` },
          { label: "Title", value: bcTitle.trim() },
        ]}
        confirmLabel="Send to all my players"
        busy={bcBusy}
      />
    </div>
  );
}
