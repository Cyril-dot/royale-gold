import { requireRole } from "@/lib/auth";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { adminOverview } from "@/lib/admin";

/** Owner preview of one admin's panel (same payload as /api/admin/overview). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("owner");
    const { id } = await params;
    const payload = await adminOverview(id);
    if (!payload) return fail("Admin not found", 404);
    return ok(payload);
  } catch (err) {
    return toErrorResponse(err);
  }
}
