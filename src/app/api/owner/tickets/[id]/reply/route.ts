// P0 Batch 3 (A11): the owner replies to a ticket while previewing an
// admin's inbox. The reply is sent AS the admin (the player sees the
// admin's name); the AuditLog records the owner as the actor.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { replyToTicket } from "@/lib/tickets";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const owner = await requireRole("owner");
    const { id } = await params;
    const body = await readJson<{ body?: string }>(req);
    const text = (body?.body ?? "").trim();
    if (text.length < 1) return fail("A reply is required");
    if (text.length > 2000) return fail("Reply is too long (max 2000 characters)");
    const t = await prisma.ticket.findUnique({ where: { id } });
    if (!t) return fail("Ticket not found", 404);
    if (t.status === "closed") return fail("This ticket is closed", 400);
    if (!t.adminId) return fail("This ticket is not assigned to an admin", 400);
    const updated = await replyToTicket(id, t.adminId, owner.id, text);
    return ok(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}
