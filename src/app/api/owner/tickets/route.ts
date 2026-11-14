// P0 Batch 3 (A11): the owner's preview of an admin's ticket inbox.
// GET ?adminId= lists that admin's tickets. The owner bypasses the
// admin's permissions — this is the same inbox the admin sees.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { listTicketsForAdmin, ticketDetail } from "@/lib/tickets";

export async function GET(req: Request) {
  try {
    await requireRole("owner");
    const sp = new URL(req.url).searchParams;
    const adminId = sp.get("adminId") || undefined;
    const status = sp.get("status") || undefined;
    if (!adminId) return fail("adminId is required");
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== "admin") return fail("Admin not found", 404);
    return ok({ tickets: await listTicketsForAdmin(adminId, status) });
  } catch (err) {
    return toErrorResponse(err);
  }
}
