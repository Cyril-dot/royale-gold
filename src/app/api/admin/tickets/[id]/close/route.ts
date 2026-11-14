// P0 Batch 3 (A11): the admin closes one of their own players' tickets.
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { closeTicketById } from "@/lib/tickets";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "tickets");
    const { id } = await params;
    const t = await prisma.ticket.findUnique({ where: { id } });
    if (!t || t.adminId !== admin.id) return fail("Ticket not found", 404);
    if (t.status === "closed") return fail("This ticket is already closed", 400);
    const updated = await closeTicketById(id, admin.id);
    return ok(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}
