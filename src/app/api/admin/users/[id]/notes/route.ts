// P1 Batch 1 (A19): admin-only notes on a player. Notes live on the
// admin player detail only — the player never sees them. GET lists
// them (newest first, with the author); POST adds one.
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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireRole("admin", "owner");
    if (me.role === "admin") requirePermission(me, "players");
    const { id } = await params;
    const check = await scopeCheck(me, id);
    if ("error" in check) return fail(check.error, 404);
    const notes = await prisma.playerNote.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { admin: { select: { id: true, name: true } } },
    });
    return ok({
      notes: notes.map((n) => ({
        id: n.id, text: n.text, authorId: n.adminId, authorName: n.admin.name,
        createdAt: n.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireRole("admin");
    requirePermission(me, "players");
    const { id } = await params;
    const body = await readJson<{ text?: string }>(req);
    if (!body) return fail("Invalid JSON body");
    const text = (body.text ?? "").trim();
    if (text.length < 2) return fail("A note needs at least 2 characters");
    if (text.length > 1000) return fail("A note is at most 1000 characters");
    const check = await scopeCheck(me, id);
    if ("error" in check) return fail(check.error, 404);

    const note = await prisma.$transaction(async (tx) => {
      const created = await tx.playerNote.create({
        data: { userId: id, adminId: me.id, text },
        include: { admin: { select: { id: true, name: true } } },
      });
      await tx.auditLog.create({
        data: { actorId: me.id, action: "player.note.add", targetId: id, detail: `Note on ${check.target.name}: ${text.slice(0, 120)}${text.length > 120 ? "…" : ""}` },
      });
      return created;
    });

    return ok({
      note: {
        id: note.id, text: note.text, authorId: note.adminId, authorName: note.admin.name,
        createdAt: note.createdAt.toISOString(),
      },
    }, 201);
  } catch (err) {
    if (err instanceof Error) return fail(err.message, 400);
    return toErrorResponse(err);
  }
}
