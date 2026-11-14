// P1 Batch 2 (A23): the player's own notifications — in-app only.
// A player sees ONLY their own rows, newest first, with the unread
// count. The account page renders this list.
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/http";

export async function GET() {
  try {
    const me = await requireAuth();
    const [rows, unread] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: me.id },
        include: { admin: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.notification.count({ where: { userId: me.id, readAt: null } }),
    ]);
    return ok({
      unread,
      notifications: rows.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        from: r.admin.name,
        readAt: r.readAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
