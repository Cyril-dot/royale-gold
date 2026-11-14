// P1 Batch 2 (A23): mark ALL of the signed-in player's notifications
// as read (the account page's "Mark all as read" button).
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/http";

export async function POST() {
  try {
    const me = await requireAuth();
    const updated = await prisma.notification.updateMany({
      where: { userId: me.id, readAt: null },
      data: { readAt: new Date() },
    });
    return ok({ read: updated.count });
  } catch (err) {
    return toErrorResponse(err);
  }
}
