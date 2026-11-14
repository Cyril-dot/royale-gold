// P0 Batch 4 (A9): the owner's preview of an admin's downline tree.
// GET ?adminId= — the same tree the admin sees.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { downlineTree } from "@/lib/admin";

export async function GET(req: Request) {
  try {
    await requireRole("owner");
    const adminId = new URL(req.url).searchParams.get("adminId") || undefined;
    if (!adminId) return fail("adminId is required");
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== "admin") return fail("Admin not found", 404);
    return ok(await downlineTree(adminId));
  } catch (err) {
    return toErrorResponse(err);
  }
}
