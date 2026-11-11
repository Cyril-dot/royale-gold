import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { normalizeCode } from "@/lib/serialize";

/** Public check used by the register form: is this referral code real + active? */
export async function GET(req: Request) {
  try {
    const code = req.url ? new URL(req.url).searchParams.get("code") : null;
    if (!code) return fail("code query param is required");
    const row = await prisma.referralCode.findUnique({
      where: { code: normalizeCode(code) },
      include: { admin: { select: { name: true } } },
    });
    if (!row || !row.active) return ok({ valid: false, code: normalizeCode(code) });
    return ok({ valid: true, code: row.code, adminName: row.admin.name });
  } catch (err) {
    return toErrorResponse(err);
  }
}
