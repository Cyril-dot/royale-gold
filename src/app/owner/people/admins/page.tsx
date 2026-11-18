// Owner Admins (Phase 4 restyle) — split out of the old one-page owner
// panel (deleted in Phase 4). Same endpoints, same behaviour,
// staff-ui throughout: add-admin form + DataTable (search / status
// filter / pagination, cards on phone), masked admin emails with audited
// reveal, and every consequential action behind the shared ConfirmDialog.
// OwnerAdminPerms (permissions editor + kill-sessions) is restyled too
// and renders inside each row's expanded area.
"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "../../../../lib/api";
import { COUNTRIES } from "../../../../lib/country";
import { copyText } from "../../../../lib/admin-client";
import { useStore } from "../../../../lib/store";
import { useOwner } from "../../../../components/owner/OwnerContext";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { useOwnerFetch } from "../../../../components/owner/useOwnerFetch";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { Card } from "../../../../components/staff-ui/Card";
import { Button } from "../../../../components/staff-ui/Button";
import { Input, Select, FormField } from "../../../../components/staff-ui/Form";
import { DataTable, type DataColumn, type DataRowAction } from "../../../../components/staff-ui/DataTable";
import { Badge } from "../../../../components/staff-ui/Badge";
import { ConfirmDialog } from "../../../../components/staff-ui/Dialog";
import { MaskedValue } from "../../../../components/staff-ui/MaskedValue";
import { fmtStaffMoney, fmtStaffInt } from "../../../../components/staff-ui/format";
import { OwnerAdminPerms } from "../../../../components/owner/OwnerAdminPerms";
import type { AdminRow } from "../../../../components/owner/owner-types";

/** Audited reveal for one admin's email (kind "user-contact" works for
 *  any user id — the reveal route selects from the user table with no
 *  role check, so it covers admins too). */
function AdminEmail({ a }: { a: AdminRow }) {
  return (
    <MaskedValue
      value={a.email}
      kind="email"
      label="Admin email"
      onReveal={async () => {
        const r = await api<{ value: { email: string | null; phone: string | null } }>("/api/owner/reveal", {
          method: "POST",
          body: JSON.stringify({ kind: "user-contact", id: a.id }),
        });
        return r.value.email;
      }}
    />
  );
}

/** Per-admin edit zone (expanded row): commission %, parent picker,
 *  referral codes, preview link, and the permissions editor. */
function AdminEdit({
  a,
  parents,
  pctValue,
  onPctChange,
  pctChanged,
  onSavePct,
  parentBusy,
  onSaveParent,
  copied,
  onCopyLink,
  onSaved,
}: {
  a: AdminRow;
  parents: AdminRow[];
  pctValue: number;
  onPctChange: (v: number) => void;
  pctChanged: boolean;
  onSavePct: () => void;
  parentBusy: boolean;
  onSaveParent: (parentAdminId: string) => void;
  copied: boolean;
  onCopyLink: () => void;
  onSaved: () => Promise<void>;
}) {
  return (
    <div>
      <FormField label="Commission %" hint="Applies to future deposits only.">
        <Input
          type="number"
          min={0}
          max={100}
          value={pctValue}
          onChange={(e) => onPctChange(Number(e.target.value))}
          aria-label={`Commission % for ${a.name}`}
        />
      </FormField>
      <Button variant="secondary" size="sm" disabled={!pctChanged} onClick={onSavePct}>
        Save %
      </Button>{" "}
      <FormField label="Parent admin" hint="A senior agent whose panel rolls this admin's downline in. Two levels only.">
        <Select
          value={a.parentAdminId ?? ""}
          disabled={parentBusy}
          onChange={(e) => onSaveParent(e.target.value)}
          aria-label={`Parent admin for ${a.name}`}
        >
          <option value="">No parent</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </FormField>
      <p>
        Codes: {a.codes.map((c) => c.code).join(", ") || "—"}
        {a.codes.length > 0 ? (
          <>
            {" "}
            <Button variant="ghost" size="sm" onClick={onCopyLink}>
              {copied ? "Copied ✓" : "Copy referral link"}
            </Button>
          </>
        ) : null}{" "}
        <Link href={`/admin?preview=${a.id}`}>Preview panel</Link>
      </p>
      {a.totpEnabled ? <Badge variant="ok">2FA on</Badge> : <Badge variant="muted">2FA off</Badge>}
      <OwnerAdminPerms a={a} onSaved={onSaved} />
    </div>
  );
}

export default function OwnerAdminsPage() {
  const { user, toast } = useStore();
  const { loadAdmins } = useOwner();
  const router = useRouter();

  const { data, err, loading, reload } = useOwnerFetch<{ admins: AdminRow[] }>(
    user ? "/api/owner/admins" : null,
  );
  const admins = useMemo(() => data?.admins ?? [], [data]);
  // Keep the shared context copy fresh for the other owner routes that
  // still read it (promotions, support) after any mutation here.
  const refresh = useCallback(async () => {
    reload();
    await loadAdmins();
  }, [reload, loadAdmins]);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Per-admin referral link copy (first active code) — the admin's own
  // panel lives on the /admin routes; "Preview panel" links there with
  // ?preview=<adminId>.
  const copyAdminLink = (a: AdminRow) => {
    const c = a.codes.find((x) => x.active) ?? a.codes[0];
    if (!c) return;
    const link = `${window.location.origin}/?ref=${c.code}`;
    void copyText(link).then(() => {
      setCopiedId(a.id);
      toast("Referral link copied", "win");
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopiedId(null), 1600);
    }).catch(() => toast("Copy failed — long-press the link to copy it", "lose"));
  };

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pct, setPct] = useState(10);
  // Phase 1 country-based (Nov 2026): the new admin's country — the
  // fiat follows it (GH → GHS, NG → NGN).
  const [adminCountry, setAdminCountry] = useState("GH");
  const [addBusy, setAddBusy] = useState(false);
  const [addConfirm, setAddConfirm] = useState(false);
  const [editing, setEditing] = useState<Record<string, number>>({});
  const [pctConfirm, setPctConfirm] = useState<{ a: AdminRow; pct: number } | null>(null);
  const [toggleConfirm, setToggleConfirm] = useState<AdminRow | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  // O24: the parent picker per admin — the select's value is the admin's
  // current parent; changing it saves at once. One busy id at a time.
  const [parentBusy, setParentBusy] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return admins.filter((a) => {
      if (statusFilter === "active" && !a.active) return false;
      if (statusFilter === "deactivated" && a.active) return false;
      if (!needle) return true;
      return (
        a.name.toLowerCase().includes(needle) ||
        a.email.toLowerCase().includes(needle) ||
        a.codes.some((c) => c.code.toLowerCase().includes(needle))
      );
    });
  }, [admins, q, statusFilter]);
  const activeCount = admins.filter((a) => a.active).length;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const doAddAdmin = async () => {
    setAddBusy(true);
    try {
      await api("/api/owner/admins", { method: "POST", body: JSON.stringify({ name: name.trim(), email: email.trim(), password, commissionPct: pct, country: adminCountry }) });
      setName(""); setEmail(""); setPassword(""); setPct(10); setAdminCountry("GH");
      setAddConfirm(false);
      toast("Admin added", "win");
      await refresh();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not add admin", "lose");
    } finally { setAddBusy(false); }
  };

  const doSavePct = async () => {
    if (!pctConfirm) return;
    const { a, pct: v } = pctConfirm;
    setActionBusy(true);
    try {
      await api(`/api/owner/admins/${a.id}`, { method: "PATCH", body: JSON.stringify({ commissionPct: v }) });
      toast("Commission % updated — future deposits only", "win");
      setPctConfirm(null);
      setEditing((ed) => {
        const next = { ...ed };
        delete next[a.id];
        return next;
      });
      await refresh();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Update failed", "lose");
    } finally { setActionBusy(false); }
  };

  const doToggleActive = async () => {
    if (!toggleConfirm) return;
    const a = toggleConfirm;
    setActionBusy(true);
    try {
      await api(`/api/owner/admins/${a.id}`, { method: "PATCH", body: JSON.stringify({ active: !a.active }) });
      toast(a.active ? "Admin deactivated" : "Admin reactivated", "win");
      setToggleConfirm(null);
      await refresh();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Update failed", "lose");
    } finally { setActionBusy(false); }
  };

  // P1 Batch 4 (O24): set or clear an admin's parent admin.
  const saveParent = async (adminId: string, parentAdminId: string) => {
    setParentBusy(adminId);
    try {
      await api(`/api/owner/admins/${adminId}/parent`, { method: "POST", body: JSON.stringify({ parentAdminId: parentAdminId || null }) });
      toast(parentAdminId ? "Parent admin set — their panel now rolls this downline in" : "Parent admin cleared", "win");
      await refresh();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not set parent admin", "lose");
    } finally { setParentBusy(null); }
  };

  const columns: DataColumn<AdminRow>[] = [
    {
      key: "admin",
      label: "Admin",
      render: (a) => a.name,
      sub: (a) => <AdminEmail a={a} />,
      // NOTE: DataTable's phone CardList only reads `details` from
      // columns AFTER the first — details on the first column never
      // render. Every detail below lives on its own column.
    },
    {
      key: "status",
      label: "Status",
      render: (a) => (a.active ? <Badge variant="ok">Active</Badge> : <Badge variant="muted">Deactivated</Badge>),
      details: (a) => [
        ["Status", a.active ? "Active" : "Deactivated"],
        ...(a.totpEnabled ? [["2FA", "On"] as [string, ReactNode]] : []),
      ],
    },
    {
      key: "pct",
      label: "Commission",
      render: (a) => `${a.commissionPct ?? 0}%`,
      details: (a) => [["Commission", `${a.commissionPct ?? 0}%`]],
    },
    {
      key: "amount",
      label: "Commission all-time",
      render: (a) => fmtStaffMoney(a.commissionAllTime, a.commissionCurrency ?? a.currency ?? "GHS"),
      details: (a) => [
        ["Commission all-time", fmtStaffMoney(a.commissionAllTime, a.commissionCurrency ?? a.currency ?? "GHS")],
      ],
    },
    {
      key: "country",
      label: "Country",
      render: (a) => (a.country ? (COUNTRIES.find((c) => c.code === a.country)?.name ?? a.country) : "—"),
      details: (a) => [
        ["Country", a.country ? (COUNTRIES.find((c) => c.code === a.country)?.name ?? a.country) : "—"],
      ],
    },
    {
      key: "parent",
      label: "Parent",
      render: (a) => a.parentName ?? "—",
      details: (a) => [["Parent", a.parentName ?? "—"]],
    },
    {
      key: "referrals",
      label: "Referrals",
      render: (a) => fmtStaffInt(a.referralCount),
      details: (a) => [
        ["Referrals", fmtStaffInt(a.referralCount)],
        ["Coins given", fmtStaffInt(a.coinsGiven)],
        ["Codes", a.codes.map((c) => c.code).join(", ") || "—"],
      ],
    },
  ];

  const rowActions: DataRowAction<AdminRow>[] = [
    {
      label: "Deactivate",
      danger: true,
      onClick: (a) => setToggleConfirm(a),
      disabled: (a) => !a.active || actionBusy,
    },
    {
      label: "Reactivate",
      onClick: (a) => setToggleConfirm(a),
      disabled: (a) => a.active || actionBusy,
    },
    {
      label: "Copy referral link",
      onClick: (a) => copyAdminLink(a),
      disabled: (a) => a.codes.length === 0,
    },
    {
      label: "Preview panel",
      onClick: (a) => router.push(`/admin?preview=${a.id}`),
    },
  ];

  const newCountry = COUNTRIES.find((c) => c.code === adminCountry);

  return (
    <div>
      <PageHeader title="Admins" sub="Add, edit, deactivate and preview admins." />
      <OwnerRangeBar />
      <Card title="Add admin" sub="The new admin signs in on the admin panel with this email and password.">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setAddConfirm(true);
          }}
        >
          <FormField label="Name" required>
            <Input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="off" />
          </FormField>
          <FormField label="Email" required>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" />
          </FormField>
          <FormField label="Password" required hint="At least 6 characters.">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
          </FormField>
          <FormField label="Commission %" hint="Applies to future deposits only.">
            <Input type="number" min={0} max={100} value={pct} onChange={(e) => setPct(Number(e.target.value))} />
          </FormField>
          <FormField label="Country" hint="The fiat follows the country (GH → GHS, NG → NGN).">
            <Select value={adminCountry} onChange={(e) => setAdminCountry(e.target.value)} aria-label="New admin country">
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.name} ({c.currency})</option>
              ))}
            </Select>
          </FormField>
          <Button variant="primary" type="submit">
            Review &amp; add admin
          </Button>
        </form>
      </Card>

      <Card title={`All admins (${admins.length})`}>
        <DataTable<AdminRow>
          viewId="owner-admins"
          columns={columns}
          rows={pageRows}
          total={filtered.length}
          page={safePage}
          pageSize={pageSize}
          onPageChange={(p) => setPage(p)}
          search={q}
          onSearchChange={(v) => { setQ(v); setPage(1); }}
          searchPlaceholder="Search by name, email or code…"
          filters={[
            { id: "", label: "All", count: admins.length },
            { id: "active", label: "Active", count: activeCount },
            { id: "deactivated", label: "Deactivated", count: admins.length - activeCount },
          ]}
          activeFilter={statusFilter}
          onFilterChange={(id) => { setStatusFilter(id); setPage(1); }}
          loading={loading}
          error={err}
          onRetry={reload}
          emptyTitle="No admins yet."
          emptyText="Add the first admin above — they sign in on the admin panel."
          rowActions={rowActions}
          expandable
          expandRender={(a) => (
            <AdminEdit
              a={a}
              parents={admins.filter((p) => p.id !== a.id && !p.parentAdminId)}
              pctValue={editing[a.id] ?? a.commissionPct ?? 0}
              onPctChange={(v) => setEditing((ed) => ({ ...ed, [a.id]: v }))}
              pctChanged={editing[a.id] !== undefined && editing[a.id] !== (a.commissionPct ?? 0)}
              onSavePct={() => setPctConfirm({ a, pct: editing[a.id] ?? a.commissionPct ?? 0 })}
              parentBusy={parentBusy === a.id}
              onSaveParent={(parentId) => void saveParent(a.id, parentId)}
              copied={copiedId === a.id}
              onCopyLink={() => copyAdminLink(a)}
              onSaved={refresh}
            />
          )}
        />
      </Card>

      <ConfirmDialog
        open={addConfirm}
        onClose={() => setAddConfirm(false)}
        onConfirm={() => void doAddAdmin()}
        title="Add admin"
        body="This creates a new admin account that can sign in on the admin panel."
        facts={[
          { label: "Name", value: name.trim() || "—" },
          { label: "Email", value: email.trim() || "—" },
          { label: "Country", value: newCountry ? `${newCountry.name} (${newCountry.currency})` : adminCountry },
          { label: "Commission", value: `${pct}%` },
        ]}
        confirmLabel="Add admin"
        auditNote={false}
        busy={addBusy}
      />
      <ConfirmDialog
        open={pctConfirm !== null}
        onClose={() => setPctConfirm(null)}
        onConfirm={() => void doSavePct()}
        title="Change commission %"
        body="Applies to future deposits only — past commission does not change."
        facts={
          pctConfirm
            ? [
                { label: "Admin", value: pctConfirm.a.name },
                { label: "Commission now", value: `${pctConfirm.a.commissionPct ?? 0}%` },
                { label: "Commission after", value: `${pctConfirm.pct}%` },
              ]
            : []
        }
        confirmLabel="Save %"
        auditNote={false}
        busy={actionBusy}
      />
      <ConfirmDialog
        open={toggleConfirm !== null}
        onClose={() => setToggleConfirm(null)}
        onConfirm={() => void doToggleActive()}
        title={toggleConfirm?.active ? `Deactivate ${toggleConfirm.name}` : `Reactivate ${toggleConfirm?.name ?? ""}`}
        body={
          toggleConfirm?.active
            ? "Deactivating kills all of their sessions at once — they must sign in again. Their referral codes and history stay in place."
            : "They can sign in on the admin panel again with their existing password."
        }
        facts={
          toggleConfirm
            ? [
                { label: "Admin", value: toggleConfirm.name },
                { label: "Status now", value: toggleConfirm.active ? "Active" : "Deactivated" },
                { label: "Status after", value: toggleConfirm.active ? "Deactivated" : "Active" },
              ]
            : []
        }
        confirmLabel={toggleConfirm?.active ? "Deactivate" : "Reactivate"}
        danger={toggleConfirm?.active ?? false}
        auditNote={toggleConfirm?.active ?? false}
        busy={actionBusy}
      />
    </div>
  );
}
