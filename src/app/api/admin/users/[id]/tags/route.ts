// P1 Batch 1 (A19): admin-only tags on a player (free-text, e.g.
// "VIP", "fraud watch", "high value"). Tags show as small pills on the
// player detail and on the Players list rows — the player never sees
// them. POST adds one (idempotent: adding a tag that is already there
// just returns the current list); DELETE removes one.
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";

type ScopeResult =
  | { target: { id: string; name: string; referredByAdminId: string | null } }
  | { error: string };

async function scopeCheck(me: { id: string; role: string }, id: string): Promise<ScopeResult> {
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return { error: "User not found" };
  if (me.role === "admin" && target.referredByAdminId !== me.id) return { error: "This user was not referred by you" };
  return { target: { id: target.id, name: target.name, referredByAdminId: target.referredByAdminId } };
}

async function currentTags(id: string): Promise<string[]> {
  const rows = await prisma.playerTag.findMany({
    where: { userId: id },
    orderBy: { createdAt: "asc" },
    select: { tag: true },
  });
  return rows.map((r) => r.tag);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireRole("admin");
    requirePermission(me, "players");
    const { id } = await params;
    const body = await readJson<{ tag?: string }>(req);
    if (!body) return fail("Invalid JSON body");
    const tag = (body.tag ?? "").trim();
    if (tag.length < 2) return fail("A tag needs at least 2 characters");
    if (tag.length > 30) return fail("A tag is at most 30 characters");
    const check = await scopeCheck(me, id);
    if ("error" in check) return fail(check.error, 404);

    const existing = await prisma.playerTag.findUnique({ where: { userId_tag: { userId: id, tag } } });
    if (!existing) {
      await prisma.$transaction(async (tx) => {
        await tx.playerTag.create({ data: { userId: id, adminId: me.id, tag } });
        await tx.auditLog.create({
          data: { actorId: me.id, action: "player.tag.add", targetId: id, detail: `Tag "${tag}" added to ${check.target.name}` },
        });
      });
    }
    return ok({ tags: await currentTags(id) }, 201);
  } catch (err) {
    if (err instanceof Error) return fail(err.message, 400);
    return toErrorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireRole("admin");
    requirePermission(me, "players");
    const { id } = await params;
    const tag = (new URL(req.url).searchParams.get("tag") ?? "").trim();
    if (!tag) return fail("tag query param is required");
    const check = await scopeCheck(me, id);
    if ("error" in check) return fail(check.error, 404);

    await prisma.$transaction(async (tx) => {
      await tx.playerTag.deleteMany({ where: { userId: id, tag } });
      await tx.auditLog.create({
        data: { actorId: me.id, action: "player.tag.remove", targetId: id, detail: `Tag "${tag}" removed from ${check.target.name}` },
      });
    });
    return ok({ tags: await currentTags(id) });
  } catch (err) {
    return toErrorResponse(err);
  }
}
