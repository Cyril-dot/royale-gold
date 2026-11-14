// P2 Batch 2 (O30): the CMS — the owner edits the title + body of
// the site pages and toggles them active/inactive. The three default
// pages (About, Terms, Privacy) are seeded on first read.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { AuthError } from "@/lib/errors";
import { getCmsPages } from "@/lib/cms";

export async function GET() {
  try {
    const me = await requireRole("owner");
    const pages = await getCmsPages(me.id);
    return ok({ pages });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const me = await requireRole("owner");
    const body = await readJson<{ slug?: string; title?: string; body?: string; active?: boolean }>(req);
    const slug = (body?.slug ?? "").trim().toLowerCase();
    if (!/^[a-z0-9-]{2,40}$/.test(slug)) return fail("The slug must be 2–40 lowercase letters, digits or dashes");
    const title = (body?.title ?? "").trim();
    if (title.length < 2 || title.length > 100) return fail("The title needs 2–100 characters");
    const pageBody = (body?.body ?? "").trim();
    if (pageBody.length < 1 || pageBody.length > 20000) return fail("The body needs 1–20,000 characters");
    const active = body?.active !== false;
    const existing = await prisma.cmsPage.findUnique({ where: { slug } });
    if (!existing) return fail("This page does not exist — pages are created by the seed (About, Terms, Privacy)", 404);
    const saved = await prisma.cmsPage.update({
      where: { slug },
      data: { title, body: pageBody, active, updatedBy: me.id },
    });
    await prisma.auditLog.create({
      data: {
        actorId: me.id, action: "cms.edit", targetId: slug,
        detail: `CMS: edited “${title}” (/${slug}) — ${active ? "active" : "inactive"}`,
      },
    });
    return ok({
      page: {
        slug: saved.slug, title: saved.title, body: saved.body, active: saved.active,
        updatedAt: saved.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return toErrorResponse(err);
    if (err instanceof Error) return fail(err.message, 400);
    return toErrorResponse(err);
  }
}
