// P0 Batch 3 (A11): the admin replies to one of their own players'
// tickets. The reply is a TicketMessage (senderRole "admin") and the
// ticket moves to "answered". The reply + the status change + the
// AuditLog row are written in one transaction.
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { replyToTicket } from "@/lib/tickets";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "tickets");
    const { id } = await params;
    const body = await readJson<{ body?: string }>(req);
    const text = (body?.body ?? "").trim();
    if (text.length < 1) return fail("A reply is required");
    if (text.length > 2000) return fail("Reply is too long (max 2000 characters)");
    const t = await prisma.ticket.findUnique({ where: { id } });
    if (!t || t.adminId !== admin.id) return fail("Ticket not found", 404);
    if (t.status === "closed") return fail("This ticket is closed", 400);
    const updated = await replyToTicket(id, admin.id, admin.id, text);
    return ok(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}
