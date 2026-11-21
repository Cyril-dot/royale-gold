// P0 Batch 3 (A13): the second login step for accounts with 2FA enabled.
// POST /api/auth/login/totp { userId, code } — the password step already
// ran (POST /api/auth/login returned totpRequired). A valid TOTP code
// creates the session; a wrong one does not.
import { prisma } from "@/lib/prisma";
import { createSession, setSessionCookie, SESSION_USER_SELECT } from "@/lib/auth";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { publicUser } from "@/lib/serialize";
import { verifyTotp } from "@/lib/totp";

export async function POST(req: Request) {
  try {
    const body = await readJson<{ userId?: string; code?: string }>(req);
    if (!body) return fail("Invalid JSON body");
    const userId = (body.userId ?? "").trim();
    const code = (body.code ?? "").trim();
    if (!userId || !code) return fail("Account and code are required");

    const user = await prisma.user.findUnique({ where: { id: userId }, select: SESSION_USER_SELECT });
    if (!user || !user.active) return fail("Invalid code", 401);
    if (!user.totpEnabled || !user.totpSecret) return fail("Two-factor auth is not enabled for this account", 400);
    const valid = await verifyTotp(user.totpSecret, code);
    if (!valid) return fail("Invalid code", 401);

    await setSessionCookie(
      await createSession(user.id, user.role as "owner" | "admin" | "user", user.sessionVersion),
    );
    return ok({ user: publicUser(user) });
  } catch (err) {
    return toErrorResponse(err);
  }
}
