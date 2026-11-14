// P0 Batch 3 (A13): 2FA setup — step 1. Generates a fresh TOTP secret
// for the signed-in admin/owner, stores it (still DISABLED), and returns
// the secret + a QR data URL for the authenticator app. The code is
// verified in step 2 (POST /api/auth/2fa/verify) before 2FA turns on.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/http";
import { newTotpSecret, totpQrDataUrl } from "@/lib/totp";

export async function POST() {
  try {
    const user = await requireRole("admin", "owner");
    const secret = newTotpSecret();
    await prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: secret, totpEnabled: false },
    });
    const label = user.email ?? user.name;
    return ok({
      secret,
      qrDataUrl: await totpQrDataUrl(label, secret),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
