// P1 Batch 4 (O23): reassign a ticket to a different admin. Writes a
// TicketMessage "Reassigned to {admin}" so the history shows it, plus
// an AuditLog row. The ticket's status is left as-is. Owner only.
import { requireRole } from "@/lib/auth";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { reassignTicket } from "@/lib/tickets";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const owner = await requireRole("owner");
    const { id } = await params;
    const body = await readJson<{ adminId?: string }>(req);
    if (!body) return fail("Invalid JSON body");
    if (!body.adminId) return fail("adminId is required");
    const done = await reassignTicket(id, body.adminId, owner.id);
    if (!done) return fail("Ticket or admin not found", 404);
    return ok({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
