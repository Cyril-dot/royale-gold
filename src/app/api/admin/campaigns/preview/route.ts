// P2 Batch 1 (A25): the recipient-count preview — how many players
// an audience reaches, BEFORE the campaign is created or sent. Same
// resolver as the send, so the number shown here is the number that
// gets the message. `players` is a comma-separated list of user ids.
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { AuthError } from "@/lib/errors";
import { resolveCampaignRecipients, type CampaignAudience } from "@/lib/campaigns";

export async function GET(req: Request) {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "campaigns");
    const sp = new URL(req.url).searchParams;
    const audience = (sp.get("audience") ?? "all") as CampaignAudience;
    const segment = sp.get("segment");
    const players = sp.get("players");
    const playerIds = players ? players.split(",").map((s) => s.trim()).filter(Boolean) : null;
    const resolved = await resolveCampaignRecipients(admin.id, audience, segment, playerIds, { allowEmpty: true });
    return ok({ count: resolved.userIds.length, sample: resolved.sample });
  } catch (err) {
    if (err instanceof AuthError) return toErrorResponse(err);
    if (err instanceof Error) return fail(err.message, 400);
    return toErrorResponse(err);
  }
}
