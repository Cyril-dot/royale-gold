// P1 Batch 4 (O20) — announcements & banners (text only: no images,
// no links — no file hosting, no link infra).
import { prisma } from "./prisma";

export type AnnouncementAudience = "all" | "players" | "admins";

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  active: boolean;
  startsAt: string;
  endsAt: string | null;
  createdByName: string | null;
  createdAt: string;
}

const AUDIENCES: AnnouncementAudience[] = ["all", "players", "admins"];

export function isAnnouncementAudience(v: unknown): v is AnnouncementAudience {
  return typeof v === "string" && (AUDIENCES as string[]).includes(v);
}

/** The audiences a role may see: "all" for everyone, plus the role's own. */
export function visibleAudiences(role: "owner" | "admin" | "user" | null): AnnouncementAudience[] {
  if (role === "admin" || role === "owner") return ["all", "admins"];
  if (role === "user") return ["all", "players"];
  return ["all"];
}

function toRow(a: {
  id: string;
  title: string;
  body: string;
  audience: string;
  active: boolean;
  startsAt: Date;
  endsAt: Date | null;
  creator: { name: string } | null;
  createdAt: Date;
}): AnnouncementRow {
  return {
    id: a.id,
    title: a.title,
    body: a.body,
    audience: (isAnnouncementAudience(a.audience) ? a.audience : "all") as AnnouncementAudience,
    active: a.active,
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt ? a.endsAt.toISOString() : null,
    createdByName: a.creator?.name ?? null,
    createdAt: a.createdAt.toISOString(),
  };
}

/** Announcements currently live for a role: active AND now inside [startsAt, endsAt]. */
export async function listActiveAnnouncements(
  role: "owner" | "admin" | "user" | null,
): Promise<AnnouncementRow[]> {
  const now = new Date();
  const rows = await prisma.announcement.findMany({
    where: {
      active: true,
      audience: { in: visibleAudiences(role) },
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gte: now } }],
    },
    include: { creator: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toRow);
}

/** Every announcement, newest first, for the owner panel. */
export async function listAllAnnouncements(): Promise<AnnouncementRow[]> {
  const rows = await prisma.announcement.findMany({
    include: { creator: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toRow);
}
