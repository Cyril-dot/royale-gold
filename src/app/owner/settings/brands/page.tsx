// Owner Brands (Phase 4 restyle) — split out of the old one-page owner panel
// (deleted in Phase 4). Same endpoints, same behaviour,
// staff-ui throughout. D4: brands stay under Settings and stay config
// records only — a brand does NOT change any page, game or URL (no
// per-brand routing or theming). That label stays visible on the page.
"use client";

import { useMemo, useState, type ReactNode } from "react";
import { api } from "../../../../lib/api";
import { useStore } from "../../../../lib/store";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { Card } from "../../../../components/staff-ui/Card";
import { Button } from "../../../../components/staff-ui/Button";
import { FormField, Input } from "../../../../components/staff-ui/Form";
import { Badge } from "../../../../components/staff-ui/Badge";
import { DataTable, type DataColumn } from "../../../../components/staff-ui/DataTable";
import { Skeleton, ErrorState } from "../../../../components/staff-ui/Feedback";
import { useOwnerFetch } from "../../../../components/owner/useOwnerFetch";

// O33: multi-brand support — CONFIG records only. A brand does NOT
// change any page, game or URL (no per-brand routing or theming).
interface BrandRow {
  id: string;
  name: string;
  slug: string;
  siteName: string;
  primaryColor: string;
  secondaryColor: string;
  active: boolean;
  createdAt: string;
}

function ColourSwatches({ b }: { b: BrandRow }): ReactNode {
  return (
    <span>
      <span
        title={`Primary ${b.primaryColor}`}
        style={{ display: "inline-block", width: 14, height: 14, borderRadius: 3, background: b.primaryColor, verticalAlign: "middle" }}
      />{" "}
      <span
        title={`Secondary ${b.secondaryColor}`}
        style={{ display: "inline-block", width: 14, height: 14, borderRadius: 3, background: b.secondaryColor, verticalAlign: "middle" }}
      />
    </span>
  );
}

/** The create-brand form. Colour picks are kept after a save, exactly
 *  as before — only the name / slug / site fields clear. */
function BrandForm({ onSaved }: { onSaved: () => void }) {
  const { toast } = useStore();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [site, setSite] = useState("");
  const [primary, setPrimary] = useState("#F2C230");
  const [secondary, setSecondary] = useState("#0C2B22");
  const [busy, setBusy] = useState(false);
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/owner/brands", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          siteName: site.trim() || undefined,
          primaryColor: primary,
          secondaryColor: secondary,
        }),
      });
      toast(`Brand “${name.trim()}” created`, "win");
      setName("");
      setSlug("");
      setSite("");
      onSaved();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Brand failed", "lose");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={create}>
      <FormField label="Name" required>
        <Input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          aria-label="Brand name"
          placeholder="e.g. Royale Gold"
          required
        />
      </FormField>
      <FormField label="Slug" required>
        <Input
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
          maxLength={40}
          aria-label="Brand slug"
          placeholder="e.g. royale-gold"
          required
        />
      </FormField>
      <FormField label="Site name" hint="Defaults to the name.">
        <Input
          type="text"
          value={site}
          onChange={(e) => setSite(e.target.value)}
          maxLength={60}
          aria-label="Brand site name"
          placeholder="Defaults to the name"
        />
      </FormField>
      <FormField label="Primary colour">
        <span>
          <input
            type="color"
            value={primary}
            onChange={(e) => setPrimary(e.target.value)}
            aria-label="Brand primary colour"
            style={{ minHeight: 44, minWidth: 56 }}
          />{" "}
          {primary}
        </span>
      </FormField>
      <FormField label="Secondary colour">
        <span>
          <input
            type="color"
            value={secondary}
            onChange={(e) => setSecondary(e.target.value)}
            aria-label="Brand secondary colour"
            style={{ minHeight: 44, minWidth: 56 }}
          />{" "}
          {secondary}
        </span>
      </FormField>
      <Button variant="primary" type="submit" loading={busy}>
        Create brand
      </Button>
    </form>
  );
}

export default function OwnerBrandsPage() {
  const { user, toast } = useStore();
  const url = useMemo(() => (user ? "/api/owner/brands" : null), [user]);
  const { data, err, loading, reload } = useOwnerFetch<{ brands: BrandRow[] }>(url);
  const brands = data?.brands ?? [];
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(brands.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = brands.slice((safePage - 1) * pageSize, safePage * pageSize);
  const [toggleBusy, setToggleBusy] = useState<string | null>(null);

  // Toggling a brand changes nothing on any page, game or URL (config
  // record only) — a plain one-tap toggle, no danger confirm.
  const toggleBrand = async (b: BrandRow) => {
    setToggleBusy(b.id);
    try {
      await api(`/api/owner/brands/${b.id}/toggle`, { method: "POST" });
      toast(`Brand “${b.name}” ${b.active ? "disabled" : "enabled"}`, "win");
      reload();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not toggle the brand", "lose");
    } finally {
      setToggleBusy(null);
    }
  };

  const columns: DataColumn<BrandRow>[] = [
    {
      key: "brand",
      label: "Brand",
      render: (b) => b.name,
      sub: (b) => b.siteName,
    },
    {
      key: "slug",
      label: "Slug",
      render: (b) => b.slug,
      details: (b) => [["Slug", b.slug]],
    },
    {
      key: "site",
      label: "Site name",
      render: (b) => b.siteName,
      details: (b) => [["Site name", b.siteName]],
    },
    {
      key: "colours",
      label: "Colours",
      render: (b) => <ColourSwatches b={b} />,
      details: (b) => [
        ["Colours", <ColourSwatches key={`c-${b.id}`} b={b} />],
        ["Primary", b.primaryColor],
        ["Secondary", b.secondaryColor],
      ],
    },
    {
      key: "status",
      label: "Status",
      render: (b) => (b.active ? <Badge variant="ok">Active</Badge> : <Badge variant="muted">Inactive</Badge>),
      details: (b) => [
        ["Status", b.active ? <Badge key="st" variant="ok">Active</Badge> : <Badge key="st" variant="muted">Inactive</Badge>],
      ],
    },
  ];

  return (
    <div>
      <PageHeader title="Brands" sub="Config records only — a brand changes no page, game or URL." />
      <OwnerRangeBar />
      {loading ? (
        <Skeleton lines={5} title />
      ) : err ? (
        <ErrorState text={err} onRetry={reload} />
      ) : (
        <>
          <Card title="Create brand" sub="Config records — no effect on pages yet.">
            <BrandForm onSaved={reload} />
          </Card>
          <Card title="Brands">
            <DataTable<BrandRow>
              viewId="owner-brands"
              columns={columns}
              rows={pageRows}
              total={brands.length}
              page={safePage}
              pageSize={pageSize}
              onPageChange={setPage}
              loading={false}
              error={null}
              emptyTitle="No brands yet."
              emptyText="Create the first brand above. It is a config record only — it changes no page, game or URL."
              rowActions={[
                {
                  label: "Enable",
                  onClick: (b) => void toggleBrand(b),
                  disabled: (b) => b.active || toggleBusy === b.id,
                },
                {
                  label: "Disable",
                  onClick: (b) => void toggleBrand(b),
                  disabled: (b) => !b.active || toggleBusy === b.id,
                },
              ]}
            />
          </Card>
        </>
      )}
    </div>
  );
}
