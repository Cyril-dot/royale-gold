// Owner CMS & localisation (Phase 4 restyle) — split out of the old one-page
// owner panel (deleted in Phase 4). Same endpoint, same
// behaviour, staff-ui throughout. The editor itself lives in
// components/owner/CmsPageEditor (used only by this page).
"use client";

import { useMemo } from "react";
import { useStore } from "../../../../lib/store";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { Card } from "../../../../components/staff-ui/Card";
import { Badge } from "../../../../components/staff-ui/Badge";
import { Skeleton, EmptyState, ErrorState } from "../../../../components/staff-ui/Feedback";
import { CmsPageEditor } from "../../../../components/owner/CmsPageEditor";
import { useOwnerFetch } from "../../../../components/owner/useOwnerFetch";

export default function OwnerCmsPage() {
  const { user } = useStore();
  // O30: CMS & localisation — the site pages (About, Terms, Privacy),
  // edited here and shown on /pages/[slug] when active. English only,
  // GH₵ only — the page says so plainly.
  interface CmsRow {
    slug: string;
    title: string;
    body: string;
    active: boolean;
    updatedAt: string;
  }
  const url = useMemo(() => (user ? "/api/owner/cms" : null), [user]);
  const { data, err, loading, reload } = useOwnerFetch<{ pages: CmsRow[] }>(url);
  const cmsPages = data?.pages ?? null;
  return (
    <div>
      <PageHeader title="CMS & localisation" sub="Site pages (About, Terms, Privacy) — English only." />
      <OwnerRangeBar />
      {loading ? (
        <Skeleton lines={5} title />
      ) : err ? (
        <ErrorState text={err} onRetry={reload} />
      ) : cmsPages === null ? null : cmsPages.length === 0 ? (
        <EmptyState title="No CMS pages." text="No site pages were returned." />
      ) : (
        cmsPages.map((p) => (
          <Card key={p.slug} title={`/${p.slug}`} sub={p.active ? "Live on the public site." : "Inactive — the public page returns 404."}>
            <p>
              {p.active ? <Badge variant="ok">Active</Badge> : <Badge variant="muted">Inactive</Badge>}
            </p>
            <CmsPageEditor key={`${p.slug}:${p.updatedAt}`} page={p} onSaved={reload} />
          </Card>
        ))
      )}
    </div>
  );
}
