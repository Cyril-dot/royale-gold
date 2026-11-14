// P0 Batch 3 (A13): 2FA setup — step 2. Verifies the code from the
// authenticator app against the stored secret; on success 2FA turns ON
// and the next login requires a code. Also used to confirm a re-setup.
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
    const me = await prisma.user.findUnique({ where: { id: user.id } });
    if (!me?.totpSecret) return fail("Set up two-factor auth first", 400);
    const valid = await verifyTotp(me.totpSecret, code);
    if (!valid) return fail("Invalid code — check your authenticator app", 401);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
      await tx.auditLog.create({
        data: { actorId: user.id, action: "auth.2fa.enable", targetId: user.id, detail: "Enabled two-factor auth" },
      });
    });
    return ok({ totpEnabled: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
