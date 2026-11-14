// P2 Batch 2 (O33): multi-brand foundation — CONFIG records only.
// The one live brand (Royale Gold) is seeded on first read. A brand
// does NOT change any page, game or URL: there is no per-brand
// routing, no per-brand database and no per-brand theme switcher.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { AuthError } from "@/lib/errors";
import { getBrands } from "@/lib/brands";

export async function GET() {
  try {
    const me = await requireRole("owner");
    const brands = await getBrands(me.id);
    return ok({ brands });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireRole("owner");
    const body = await readJson<{ name?: string; slug?: string; siteName?: string; primaryColor?: string; secondaryColor?: string }>(req);
    const name = (body?.name ?? "").trim();
    if (name.length < 2 || name.length > 60) return fail("The brand needs a name of 2–60 characters");
    const slug = (body?.slug ?? "").trim().toLowerCase();
    if (!/^[a-z0-9-]{2,40}$/.test(slug)) return fail("The slug must be 2–40 lowercase letters, digits or dashes");
    const siteName = (body?.siteName ?? "").trim() || name;
    if (siteName.length > 60) return fail("The site name is too long (max 60 characters)");
    const hex = /^#[0-9a-fA-F]{6}$/;
    const primaryColor = (body?.primaryColor ?? "#F2C230").trim();
    const secondaryColor = (body?.secondaryColor ?? "#0C2B22").trim();
    if (!hex.test(primaryColor) || !hex.test(secondaryColor)) return fail("Colours must be hex, e.g. #F2C230");
    const existing = await prisma.brand.findUnique({ where: { slug } });
    if (existing) return fail(`A brand with the slug “${slug}” already exists`);
    const created = await prisma.brand.create({
      data: { name, slug, siteName, primaryColor, secondaryColor, createdBy: me.id },
    });
    await prisma.auditLog.create({
      data: {
        actorId: me.id, action: "brand.create", targetId: created.id,
        detail: `Brand: created “${name}” (${slug}) — config record only, the live site is unchanged`,
      },
    });
    return ok({
      brand: {
        id: created.id, name: created.name, slug: created.slug, siteName: created.siteName,
        primaryColor: created.primaryColor, secondaryColor: created.secondaryColor,
        active: created.active, createdAt: created.createdAt.toISOString(),
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return toErrorResponse(err);
    if (err instanceof Error) return fail(err.message, 400);
    return toErrorResponse(err);
  }
}
