// P2 Batch 2 (O30): CMS pages — the owner edits title + body and
// toggles active/inactive. Seeded lazily with About, Terms, Privacy
// (createdBy = the caller — a one-off bootstrap, not an owner action).
// A page shows on /pages/[slug] only while active; the public
// endpoint 404s an inactive or missing page.
import { prisma } from "./prisma";

export interface CmsPageRow {
  slug: string;
  title: string;
  body: string;
  active: boolean;
  updatedAt: string;
}

const DEFAULT_PAGES: { slug: string; title: string; body: string }[] = [
  {
    slug: "about",
    title: "About Royale Gold",
    body: "Royale Gold is a play-money casino — 46 games across crash, live, table, slots, beginner and arcade. Cash games play with GH₵, coin games with coins (GH₵ 5 = 1 coin, one-way). Deposits are demo cashier only and withdrawals are requests reviewed by an admin.",
  },
  {
    slug: "terms",
    title: "Terms of Use",
    body: "By playing on Royale Gold you agree that all games are for entertainment. Cash balances are demo funds — deposits are demo cashier only, withdrawals are requests reviewed by an admin, and coins are play-only and never withdrawable. You must be 18 or older to play.",
  },
  {
    slug: "privacy",
    title: "Privacy Policy",
    body: "Royale Gold collects only what it needs to run your account: your name, one contact (email or phone), your balances and your game history. We never sell your data. Admins see only their own players; the owner sees the platform. Contact the owner to delete your account.",
  },
];

export async function getCmsPages(seederId: string): Promise<CmsPageRow[]> {
  let rows = await prisma.cmsPage.findMany({ orderBy: { slug: "asc" } });
  if (rows.length === 0) {
    await prisma.cmsPage.createMany({
      data: DEFAULT_PAGES.map((p) => ({ ...p, updatedBy: seederId })),
    });
    rows = await prisma.cmsPage.findMany({ orderBy: { slug: "asc" } });
  }
  return rows.map((p) => ({
    slug: p.slug,
    title: p.title,
    body: p.body,
    active: p.active,
    updatedAt: p.updatedAt.toISOString(),
  }));
}

/** One page, only when active — the public read. null = missing or inactive. */
export async function getPublicCmsPage(slug: string): Promise<CmsPageRow | null> {
  const p = await prisma.cmsPage.findUnique({ where: { slug } });
  if (!p || !p.active) return null;
  return { slug: p.slug, title: p.title, body: p.body, active: p.active, updatedAt: p.updatedAt.toISOString() };
}
