import { requireRole } from "@/lib/auth";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { adminOverview } from "@/lib/admin";

/** Owner preview of one admin's panel (same payload as /api/admin/overview). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("owner");
    const { id } = await params;
    // Phase 1 country-based (Nov 2026): ?currency= (default the
    // admin's own currency).
    const fiatCurrency = new URL(req.url).searchParams.get("currency") || undefined;
    const payload = await adminOverview(id, fiatCurrency);
    if (!payload) return fail("Admin not found", 404);
    return ok(payload);
  } catch (err) {
    return toErrorResponse(err);
  }
}
