// P0 Batch 3 (A11): one ticket in the owner's preview of an admin's
// inbox, with its messages.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { ticketDetail } from "@/lib/tickets";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("owner");
    const { id } = await params;
    const t = await prisma.ticket.findUnique({ where: { id } });
    if (!t) return fail("Ticket not found", 404);
    return ok(await ticketDetail(id));
  } catch (err) {
    return toErrorResponse(err);
  }
}
