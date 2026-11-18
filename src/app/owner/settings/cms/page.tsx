// Owner CMS & localisation (Phase 2) — split out of the old one-page owner panel
// (src/app/owner/legacy/page.tsx). Same sections, same endpoints, same
// behaviour — now its own route, loading only its own data.
"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../lib/api";
import { useStore } from "../../../../lib/store";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { CmsPageEditor } from "../../../../components/owner/CmsPageEditor";

export default function OwnerCmsPage() {
  const { user } = useStore();
  // O30: CMS & localisation — the site pages (About, Terms, Privacy),
  // edited here and shown on /pages/[slug] when active. English only,
  // GH₵ only — the page says so plainly.
  interface CmsRow { slug: string; title: string; body: string; active: boolean; updatedAt: string }
  const [cmsPages, setCmsPages] = useState<CmsRow[] | null>(null);
  const loadCms = useCallback(async () => {
    try { setCmsPages((await api<{ pages: CmsRow[] }>("/api/owner/cms")).pages); } catch { setCmsPages([]); }
  }, []);
  useEffect(() => { if (user) void loadCms(); }, [loadCms, user]);
  return (
    <div>
      <PageHeader title="CMS & localisation" sub="Site pages." />
      <OwnerRangeBar />
      <section className="admin-sec">
      <h3>CMS &amp; localisation</h3>
      {cmsPages === null ? <p>Loading pages…</p> : cmsPages.map((p) => (
        <div key={p.slug}>
          <h4>/{p.slug}{p.active ? "" : " (inactive)"}</h4>
          <CmsPageEditor page={p} onSaved={loadCms} />
        </div>
      ))}
      </section>
    </div>
  );
}
