import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { publicUser } from "@/lib/serialize";

/** Edit an admin: commissionPct and/or active. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("owner");
    const { id } = await params;
    const body = await readJson<{ commissionPct?: number | null; active?: boolean }>(req);
    if (!body) return fail("Invalid JSON body");
    const admin = await prisma.user.findUnique({ where: { id } });
    if (!admin || admin.role !== "admin") return fail("Admin not found", 404);
    const data: { commissionPct?: number | null; active?: boolean } = {};
    if (body.commissionPct !== undefined) {
      const pct = body.commissionPct === null ? null : Number(body.commissionPct);
      if (pct !== null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) {
        return fail("commissionPct must be between 0 and 100");
      }
      data.commissionPct = pct;
    }
    if (body.active !== undefined) data.active = Boolean(body.active);
    const updated = await prisma.user.update({ where: { id }, data });
    return ok({ admin: publicUser(updated) });
  } catch (err) {
    return toErrorResponse(err);
  }
}
