// P0 Batch 3 (A13): turn 2FA off. Requires a valid current code (proof
// of possession of the authenticator). Clears the secret entirely — a
// fresh setup is needed to turn it back on.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { verifyTotp } from "@/lib/totp";

export async function POST(req: Request) {
  try {
    const user = await requireRole("admin", "owner");
    const body = await readJson<{ code?: string }>(req);
    const code = (body?.code ?? "").trim();
    if (!code) return fail("A code is required");
    const me = await prisma.user.findUnique({ where: { id: user.id }, select: { totpSecret: true, totpEnabled: true } });
    if (!me?.totpEnabled || !me.totpSecret) return fail("Two-factor auth is not enabled", 400);
    const valid = await verifyTotp(me.totpSecret, code);
    if (!valid) return fail("Invalid code — check your authenticator app", 401);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecret: null }, select: { id: true } });
      await tx.auditLog.create({
        data: { actorId: user.id, action: "auth.2fa.disable", targetId: user.id, detail: "Disabled two-factor auth" },
      });
    });
    return ok({ totpEnabled: false });
  } catch (err) {
    return toErrorResponse(err);
  }
}
