// P1 Batch 1 (A20): per-player limits, set by an admin (own downline
// only). Each field is optional and nullable — sending null clears
// that limit. Enforced server-side in settleGame, the play route and
// the deposit route (see src/lib/limits.ts). Returns the limits in
// force after the save.
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { dec, round2 } from "@/lib/money";

function parseLimit(value: unknown, name: string): number | null | { error: string } {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return { error: `${name} must be above 0 (or empty to clear)` };
  return round2(n);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireRole("admin");
    requirePermission(me, "players");
    const { id } = await params;
    const body = await readJson<{ maxStake?: number | null; maxDepositPerDay?: number | null; maxLossPerDay?: number | null; coolOffUntil?: string | null }>(req);
    if (!body) return fail("Invalid JSON body");

    const maxStake = parseLimit(body.maxStake, "Max stake");
    if (maxStake != null && typeof maxStake === "object") return fail(maxStake.error);
    const maxDepositPerDay = parseLimit(body.maxDepositPerDay, "Max deposit per day");
    if (maxDepositPerDay != null && typeof maxDepositPerDay === "object") return fail(maxDepositPerDay.error);
    const maxLossPerDay = parseLimit(body.maxLossPerDay, "Max loss per day");
    if (maxLossPerDay != null && typeof maxLossPerDay === "object") return fail(maxLossPerDay.error);

    const coolOffRaw = (body.coolOffUntil ?? "").trim();
    let coolOffUntil: Date | null = null;
    if (coolOffRaw) {
      const d = new Date(coolOffRaw + "T00:00:00Z");
      if (Number.isNaN(d.getTime())) return fail("Cool-off must be a date (YYYY-MM-DD)");
      coolOffUntil = d;
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return fail("User not found", 404);
    if (target.referredByAdminId !== me.id) return fail("This user was not referred by you", 404);

    const saved = await prisma.$transaction(async (tx) => {
      const row = await tx.playerLimit.upsert({
        where: { userId: id },
        create: { userId: id, maxStake, maxDepositPerDay, maxLossPerDay, coolOffUntil, updatedBy: me.id },
        update: { maxStake, maxDepositPerDay, maxLossPerDay, coolOffUntil, updatedBy: me.id },
      });
      const parts: string[] = [];
      parts.push(`max stake ${maxStake == null ? "cleared" : `GH₵ ${maxStake.toFixed(2)}`}`);
      parts.push(`max deposit/day ${maxDepositPerDay == null ? "cleared" : `GH₵ ${maxDepositPerDay.toFixed(2)}`}`);
      parts.push(`max loss/day ${maxLossPerDay == null ? "cleared" : `GH₵ ${maxLossPerDay.toFixed(2)}`}`);
      parts.push(`cool-off ${coolOffUntil == null ? "cleared" : `until ${coolOffUntil.toISOString().slice(0, 10)}`}`);
      await tx.auditLog.create({
        data: { actorId: me.id, action: "player.limit.set", targetId: id, detail: `Limits set for ${target.name}: ${parts.join("; ")}` },
      });
      return row;
    });

    return ok({
      limits: {
        maxStake: saved.maxStake == null ? null : dec(saved.maxStake),
        maxDepositPerDay: saved.maxDepositPerDay == null ? null : dec(saved.maxDepositPerDay),
        maxLossPerDay: saved.maxLossPerDay == null ? null : dec(saved.maxLossPerDay),
        coolOffUntil: saved.coolOffUntil?.toISOString() ?? null,
      },
    });
  } catch (err) {
    if (err instanceof Error) return fail(err.message, 400);
    return toErrorResponse(err);
  }
}
