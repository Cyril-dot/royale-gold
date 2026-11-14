// P2 Batch 2 (O30): a public CMS page — /pages/about, /pages/terms,
// /pages/privacy (and any page the owner keeps active). The body is
// the owner's plain text, shown in the site's styling. An inactive or
// missing page 404s (Next's notFound — a real 404 status).
//
// Server component (no useParams — a client component here breaks the
// build: the layout's Dock reads usePathname() during prerender).
// instant = false: this route renders on demand (blocking), not as a
// prerendered static page — the slug is only known at request time,
// and CMS edits + deactivations must reach it without a rebuild.
// (Same pattern as the admin player detail route.)
export const instant = false;

import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicCmsPage } from "@/lib/cms";

export default async function CmsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getPublicCmsPage(slug.toLowerCase());
  if (!page) notFound();
  return (
    <main className="rg48-page-main"><div className="wrap">
      <h2>{page.title}</h2>
      <p style={{ whiteSpace: "pre-wrap" }}>{page.body}</p>
      <p><Link className="btn btn-ghost" href="/">Back home</Link></p>
    </div></main>
  );
}
