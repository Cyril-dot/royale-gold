// P2 Batch 1 (A25): send a campaign — one in-app Notification row
// per recipient (in-app only) + an AuditLog "campaign.send" row, in
// one transaction. The audience is re-resolved at send time (players
// may have joined or left since the draft was made), so the sent
// count is the real count. A campaign sends ONCE — a sent campaign
// cannot be resent.
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { AuthError } from "@/lib/errors";
import { resolveCampaignRecipients, type CampaignAudience } from "@/lib/campaigns";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "campaigns");
    const { id } = await params;
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) return fail("Campaign not found", 404);
    if (campaign.createdBy !== admin.id) return fail("This campaign is not yours", 404);
    if (campaign.status !== "draft") return fail("This campaign has already been sent — a campaign sends once", 400);

    const playerIds: string[] | null = campaign.targetPlayerIds
      ? (JSON.parse(campaign.targetPlayerIds) as string[])
      : null;
    const resolved = await resolveCampaignRecipients(
      admin.id,
      campaign.audience as CampaignAudience,
      campaign.segment,
      playerIds,
    );

    const sent = await prisma.$transaction(async (tx) => {
      await tx.notification.createMany({
        data: resolved.userIds.map((userId) => ({
          userId,
          adminId: admin.id,
          title: campaign.name,
          body: campaign.message,
        })),
      });
      const updated = await tx.campaign.update({
        where: { id },
        data: { status: "sent", sentAt: new Date(), recipientCount: resolved.userIds.length },
      });
      await tx.auditLog.create({
        data: {
          actorId: admin.id, action: "campaign.send", targetId: id,
          detail: `Campaign: sent "${campaign.name}" to ${resolved.userIds.length} players`,
        },
      });
      return updated;
    });

    return ok({
      sent: resolved.userIds.length,
      campaign: {
        id: sent.id, name: sent.name, status: sent.status,
        recipientCount: sent.recipientCount, sentAt: sent.sentAt?.toISOString() ?? null,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return toErrorResponse(err);
    if (err instanceof Error) return fail(err.message, 400);
    return toErrorResponse(err);
  }
}
