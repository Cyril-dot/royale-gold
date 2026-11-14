// P0 Batch 3 (A11): the owner closes a ticket while previewing an
// admin's inbox. The AuditLog records the owner as the actor.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { closeTicketById } from "@/lib/tickets";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const owner = await requireRole("owner");
    const { id } = await params;
    const t = await prisma.ticket.findUnique({ where: { id } });
    if (!t) return fail("Ticket not found", 404);
    if (t.status === "closed") return fail("This ticket is already closed", 400);
    const updated = await closeTicketById(id, owner.id);
    return ok(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}
