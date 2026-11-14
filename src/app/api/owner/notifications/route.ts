// P1 Batch 2 (A23): the owner's view of an admin's sent notifications
// — the Overview broadcast section in owner preview (?adminId=).
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";

export async function GET(req: Request) {
  try {
    await requireRole("owner");
    const sp = new URL(req.url).searchParams;
    const adminId = sp.get("adminId");
    if (!adminId) return fail("adminId is required");
    const limit = Math.min(Math.max(Number(sp.get("limit") ?? 10) || 10, 1), 50);
    const rows = await prisma.notification.findMany({
      where: { adminId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return ok({
      sent: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        userName: r.user.name,
        title: r.title,
        body: r.body,
        readAt: r.readAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
