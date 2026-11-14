// P1 Batch 2 (A23): mark one notification as read. The notification
// must belong to the signed-in player — reading someone else's returns
// 404, the same as not found.
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireAuth();
    const { id } = await params;
    const row = await prisma.notification.findUnique({ where: { id } });
    if (!row || row.userId !== me.id) return fail("Notification not found", 404);
    if (!row.readAt) {
      await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
    }
    return ok({ id, read: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
