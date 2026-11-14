// P0 Batch 3 (O3): the Players list's data, split out of the overview
// endpoint so it can be gated by its own "players" permission. Same data
// as before (every referred user, newest first).
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { ok, toErrorResponse } from "@/lib/http";
import { referredUsers } from "@/lib/admin";
import { adminScopeInfo } from "@/lib/hierarchy";

export async function GET() {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "players");
    return ok({ players: await referredUsers(admin.id), scope: await adminScopeInfo(admin.id) });
  } catch (err) {
    return toErrorResponse(err);
  }
}
