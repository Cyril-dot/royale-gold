// P0 Batch 3 (A11): the admin's ticket inbox — tickets from their OWN
// players only (assigned at creation to the player's referring admin).
// List + open (detail) + reply + close. Tickets + replies only — no
// live chat.
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { ok, toErrorResponse } from "@/lib/http";
import { listTicketsForAdmin } from "@/lib/tickets";

export async function GET(req: Request) {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "tickets");
    const sp = new URL(req.url).searchParams;
    const status = sp.get("status") || undefined;
    return ok({ tickets: await listTicketsForAdmin(admin.id, status) });
  } catch (err) {
    return toErrorResponse(err);
  }
}
