// P2 Batch 1 (A25): CRM campaigns — resolve an audience to the real
// player ids it reaches, from the real tables. The SAME resolver runs
// for the count preview AND for the send, so the preview can never
// disagree with who actually gets the message.
//
// Scope: the admin's own downline, rolled up through child admins
// (P1 Batch 4 O24 hierarchy — adminScopeAdminIds). Only ACTIVE players
// receive a campaign (the same rule as the Overview broadcast).
import { prisma } from "./prisma";
import { adminScopeAdminIds } from "./hierarchy";
import { computePlayerSegments, SEGMENT_LABELS, type PlayerSegment } from "./segments";

export type CampaignAudience = "all" | "segment" | "players";

export const CAMPAIGN_AUDIENCES: { key: CampaignAudience; label: string }[] = [
  { key: "all", label: "All my players" },
  { key: "segment", label: "One segment" },
  { key: "players", label: "Hand-picked players" },
];

export function audienceLabel(audience: string, segment: string | null, count: number): string {
  if (audience === "segment" && segment) return `Segment: ${SEGMENT_LABELS[segment as PlayerSegment] ?? segment} (${count})`;
  if (audience === "players") return `Hand-picked players (${count})`;
  return `All players (${count})`;
}

export interface CampaignRecipient {
  id: string;
  name: string;
  contact: string | null;
}

/** Resolve an audience to recipient ids. Throws a plain message when
 * the audience is invalid, or — unless `allowEmpty` is set (the count
 * preview, where 0 is a legitimate answer) — when it reaches nobody
 * (the send refuses an empty audience — a campaign to zero players
 * is a mistake, not a send). */
export async function resolveCampaignRecipients(
  adminId: string,
  audience: CampaignAudience,
  segment?: string | null,
  playerIds?: string[] | null,
  opts?: { allowEmpty?: boolean },
): Promise<{ userIds: string[]; sample: CampaignRecipient[] }> {
  const scopeIds = await adminScopeAdminIds(adminId);
  const users = await prisma.user.findMany({
    where: { referredByAdminId: { in: scopeIds }, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, phone: true, createdAt: true },
  });

  let picked = users;
  if (audience === "segment") {
    if (!segment || !(Object.keys(SEGMENT_LABELS) as string[]).includes(segment)) {
      throw new Error("Pick a segment for this campaign");
    }
    const segByUser = await computePlayerSegments(users);
    picked = users.filter((u) => (segByUser.get(u.id)?.segments ?? []).includes(segment as PlayerSegment));
  } else if (audience === "players") {
    const wanted = new Set((playerIds ?? []).filter(Boolean));
    if (wanted.size === 0) throw new Error("Pick at least one player for this campaign");
    picked = users.filter((u) => wanted.has(u.id));
  } else if (audience !== "all") {
    throw new Error("Audience must be all, segment or players");
  }

  if (picked.length === 0 && !opts?.allowEmpty) throw new Error("This audience reaches no players right now");
  return {
    userIds: picked.map((u) => u.id),
    sample: picked.slice(0, 10).map((u) => ({ id: u.id, name: u.name, contact: u.email ?? u.phone ?? null })),
  };
}
