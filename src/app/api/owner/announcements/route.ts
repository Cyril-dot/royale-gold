// P1 Batch 4 (O20): owner announcements — list all + create.
// Text only: no images, no links (no file hosting, no link infra).
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { isAnnouncementAudience, listAllAnnouncements } from "@/lib/announcements";

export async function GET() {
  try {
    await requireRole("owner");
    return ok({ announcements: await listAllAnnouncements() });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const owner = await requireRole("owner");
    const body = await readJson<{
      title?: string;
      body?: string;
      audience?: string;
      startsAt?: string;
      endsAt?: string | null;
    }>(req);
    if (!body) return fail("Invalid JSON body");
    const title = (body.title ?? "").trim();
    if (title.length < 1 || title.length > 120) return fail("title must be 1–120 characters");
    const text = (body.body ?? "").trim();
    if (text.length < 1 || text.length > 1000) return fail("body must be 1–1000 characters");
    const audience = body.audience ?? "all";
    if (!isAnnouncementAudience(audience)) return fail('audience must be "all", "players" or "admins"');
    const startsAt = body.startsAt ? new Date(body.startsAt) : new Date();
    if (Number.isNaN(startsAt.getTime())) return fail("startsAt must be a valid date");
    let endsAt: Date | null = null;
    if (body.endsAt) {
      endsAt = new Date(body.endsAt);
      if (Number.isNaN(endsAt.getTime())) return fail("endsAt must be a valid date");
      if (endsAt <= startsAt) return fail("endsAt must be after startsAt");
    }
    const created = await prisma.$transaction(async (tx) => {
      const a = await tx.announcement.create({
        data: { title, body: text, audience, startsAt, endsAt, createdBy: owner.id },
      });
      await tx.auditLog.create({
        data: {
          actorId: owner.id,
          action: "announcement.create",
          targetId: a.id,
          detail: `Created announcement "${title}" for ${audience}`,
        },
      });
      return a;
    });
    return ok(
      {
        announcement: {
          id: created.id,
          title: created.title,
          body: created.body,
          audience: created.audience,
          active: created.active,
          startsAt: created.startsAt.toISOString(),
          endsAt: created.endsAt ? created.endsAt.toISOString() : null,
          createdAt: created.createdAt.toISOString(),
        },
      },
      201,
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
