// Payment blocks (Nov 2026): the modal asks here when it opens, so
// a blocked user sees the card up front instead of filling the form
// and failing on submit. P2021/P2022-safe — a prod DB without the
// tables answers "not blocked" and never 500s.
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/http";
import { findActiveBlock } from "@/lib/payment-blocks";

export async function GET() {
  try {
    const user = await requireAuth();
    const me = await prisma.user.findUnique({
      where: { id: user.id },
      select: { phone: true },
    });
    const block = await findActiveBlock({ userId: user.id, phoneNumber: me?.phone ?? null });
    return ok({ blocked: block !== null, blockedUntil: block?.blockedUntil ?? null });
  } catch (err) {
    return toErrorResponse(err);
  }
}
