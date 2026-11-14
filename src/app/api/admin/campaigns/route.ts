// P2 Batch 1 (A25): CRM campaigns — an admin's named message to all
// their players, one segment, or hand-picked players. A campaign is a
// DRAFT until sent; sending creates one in-app Notification row per
// recipient (in-app only — no email, SMS or push) + an AuditLog
// "campaign.send" row. The audience is resolved by the SAME resolver
// for the count preview and for the send, so the preview can never
// disagree with who actually gets the message. A campaign is sent
// ONCE — no resend, no edit after sending.
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { AuthError } from "@/lib/errors";
import { audienceLabel, resolveCampaignRecipients, type CampaignAudience } from "@/lib/campaigns";

function parsePlayerIds(value: unknown): string[] | null {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value.filter((x): x is string => typeof x === "string");
  return null;
}

function serialise(c: {
  id: string; name: string; message: string; audience: string; segment: string | null;
  targetPlayerIds: string | null; status: string; recipientCount: number; sentAt: Date | null; createdAt: Date;
}) {
  return {
    id: c.id,
    name: c.name,
    message: c.message,
    audience: c.audience,
    segment: c.segment,
    targetPlayerIds: c.targetPlayerIds ? (JSON.parse(c.targetPlayerIds) as string[]) : null,
    status: c.status,
    recipientCount: c.recipientCount,
    audienceLabel: audienceLabel(c.audience, c.segment, c.recipientCount),
    sentAt: c.sentAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}

export async function GET() {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "campaigns");
    const rows = await prisma.campaign.findMany({
      where: { createdBy: admin.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return ok({ campaigns: rows.map(serialise) });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "campaigns");
    const body = await readJson<{ name?: string; message?: string; audience?: string; segment?: string | null; targetPlayerIds?: string[] }>(req);
    if (!body) return fail("Invalid JSON body");
    const name = (body.name ?? "").trim();
    if (name.length < 2 || name.length > 120) return fail("Name must be 2–120 characters");
    const message = (body.message ?? "").trim();
    if (message.length < 2 || message.length > 2000) return fail("Message must be 2–2000 characters");
    const audience = body.audience as CampaignAudience;
    if (audience !== "all" && audience !== "segment" && audience !== "players") {
      return fail("Audience must be all, segment or players");
    }
    const segment = audience === "segment" ? (body.segment ?? "").trim() || null : null;
    const playerIds = audience === "players" ? parsePlayerIds(body.targetPlayerIds) : null;
    // The audience must resolve to at least one player right now —
    // the same resolver the send uses, so a draft is never born broken.
    const resolved = await resolveCampaignRecipients(admin.id, audience, segment, playerIds);
    const row = await prisma.campaign.create({
      data: {
        name,
        message,
        audience,
        segment,
        targetPlayerIds: playerIds ? JSON.stringify(playerIds) : null,
        status: "draft",
        recipientCount: resolved.userIds.length,
        createdBy: admin.id,
      },
    });
    return ok({ campaign: serialise(row) }, 201);
  } catch (err) {
    if (err instanceof AuthError) return toErrorResponse(err);
    if (err instanceof Error) return fail(err.message, 400);
    return toErrorResponse(err);
  }
}
