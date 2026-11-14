// P2 Batch 2 (O33): multi-brand foundation — CONFIG records only.
// Seeded lazily with the one live brand (Royale Gold, the existing
// colours). A brand does NOT change any page, game or URL: there is
// no per-brand routing, no per-brand database and no per-brand theme
// switcher — the owner page says so plainly. Switching the live site
// to a brand needs per-brand routing + theming, which is not built.
import { prisma } from "./prisma";

export interface BrandRow {
  id: string;
  name: string;
  slug: string;
  siteName: string;
  primaryColor: string;
  secondaryColor: string;
  active: boolean;
  createdAt: string;
}

export async function getBrands(seederId: string): Promise<BrandRow[]> {
  let rows = await prisma.brand.findMany({ orderBy: { createdAt: "asc" } });
  if (rows.length === 0) {
    await prisma.brand.create({
      data: {
        name: "Royale Gold",
        slug: "royale-gold",
        siteName: "Royale Gold",
        primaryColor: "#F2C230",
        secondaryColor: "#0C2B22",
        createdBy: seederId,
      },
    });
    rows = await prisma.brand.findMany({ orderBy: { createdAt: "asc" } });
  }
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    slug: b.slug,
    siteName: b.siteName,
    primaryColor: b.primaryColor,
    secondaryColor: b.secondaryColor,
    active: b.active,
    createdAt: b.createdAt.toISOString(),
  }));
}
