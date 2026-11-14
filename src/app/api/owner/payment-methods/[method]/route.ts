// P0 Batch 2 (O12): update one payment method. Body fields are all
// optional; a min/max set to null CLEARS it (back to the platform cash
// minimum for min, no cap for max). Logged to the AuditLog.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { PAYMENT_METHODS } from "@/lib/game-config";
import { round2 } from "@/lib/money";

type Body = {
  enabled?: boolean;
  minDeposit?: number | null;
  maxDeposit?: number | null;
};

export async function POST(req: Request, { params }: { params: Promise<{ method: string }> }) {
  try {
    const owner = await requireRole("owner");
    const { method } = await params;
    if (!(PAYMENT_METHODS as readonly string[]).includes(method)) {
      return fail(`Method must be one of: ${PAYMENT_METHODS.join(", ")}`, 404);
    }
    const body = await readJson<Body>(req);
    if (!body) return fail("Invalid JSON body");

    const changes: string[] = [];
    const data: { enabled?: boolean; minDeposit?: number | null; maxDeposit?: number | null } = {};
    if (typeof body.enabled === "boolean") {
      data.enabled = body.enabled;
      changes.push(body.enabled ? "enabled" : "disabled");
    }
    for (const key of ["minDeposit", "maxDeposit"] as const) {
      if (key in body) {
        const v = body[key];
        if (v === null) {
          data[key] = null;
          changes.push(`${key} cleared`);
        } else if (typeof v === "number" && Number.isFinite(v) && v >= 0 && Math.abs(round2(v) - v) <= 1e-9) {
          data[key] = round2(v);
          changes.push(`${key} = GH₵ ${round2(v).toFixed(2)}`);
        } else {
          return fail(`${key} must be a GH₵ amount >= 0`);
        }
      }
    }
    if (changes.length === 0) return fail("Nothing to update");
    const existing = await prisma.paymentMethodConfig.findUnique({ where: { method } });
    const mergedMin =
      "minDeposit" in body ? data.minDeposit : existing?.minDeposit == null ? null : Number(existing.minDeposit.toString());
    const mergedMax =
      "maxDeposit" in body ? data.maxDeposit : existing?.maxDeposit == null ? null : Number(existing.maxDeposit.toString());
    if (mergedMin != null && mergedMax != null && mergedMin > mergedMax) {
      return fail("Minimum deposit cannot be above the maximum deposit");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.paymentMethodConfig.upsert({
        where: { method },
        create: { method, ...data },
        update: data,
      });
      await tx.auditLog.create({
        data: {
          actorId: owner.id,
          action: "payment.method",
          targetId: method,
          detail: `${method}: ${changes.join(", ")}`,
        },
      });
      return row;
    });

    return ok({
      method: updated.method,
      enabled: updated.enabled,
      minDeposit: updated.minDeposit == null ? null : Number(updated.minDeposit.toString()),
      maxDeposit: updated.maxDeposit == null ? null : Number(updated.maxDeposit.toString()),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
