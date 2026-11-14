// P1 Batch 4 (O20): the public announcements feed — only the
// announcements currently live for the caller's role. Players see
// "all" + "players", admins see "all" + "admins", signed-out visitors
// see "all" only. No auth required (a signed-out visitor may read it).
import { getSessionUser } from "@/lib/auth";
import { ok, toErrorResponse } from "@/lib/http";
import { listActiveAnnouncements } from "@/lib/announcements";

export async function GET() {
  try {
    const user = await getSessionUser();
    const role = user ? (user.role as "owner" | "admin" | "user") : null;
    return ok({ announcements: await listActiveAnnouncements(role) });
  } catch (err) {
    return toErrorResponse(err);
  }
}
