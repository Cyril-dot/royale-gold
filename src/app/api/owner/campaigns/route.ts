// P2 Batch 1 (A25): the owner's campaign oversight — one admin's
// campaigns in preview (?adminId=). Read-only: the owner views, the
// admin sends.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { audienceLabel } from "@/lib/campaigns";

export async function GET(req: Request) {
  try {
    await requireRole("owner");
    const sp = new URL(req.url).searchParams;
    const adminId = sp.get("adminId") || undefined;
    if (!adminId) return fail("adminId is required");
    const rows = await prisma.campaign.findMany({
      where: { createdBy: adminId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return ok({
      campaigns: rows.map((c) => ({
        id: c.id,
        name: c.name,
        message: c.message,
        audience: c.audience,
        segment: c.segment,
        status: c.status,
        recipientCount: c.recipientCount,
        audienceLabel: audienceLabel(c.audience, c.segment, c.recipientCount),
        sentAt: c.sentAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
