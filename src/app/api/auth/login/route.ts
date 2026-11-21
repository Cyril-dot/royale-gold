import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession, setSessionCookie, SESSION_USER_SELECT } from "@/lib/auth";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { publicUser } from "@/lib/serialize";

export async function POST(req: Request) {
  try {
    const body = await readJson<{ emailOrPhone?: string; password?: string }>(req);
    if (!body) return fail("Invalid JSON body");
    const emailOrPhone = (body.emailOrPhone ?? "").trim();
    const password = body.password ?? "";
    if (!emailOrPhone || !password) return fail("Email/phone and password are required");

    // '@' -> email branch (lowercased); otherwise phone branch.
    // Phone is not unique, so a shared phone resolves to nobody — those
    // users sign in by email. Explicit select: sign-in fetches only
    // the session columns.
    const user = emailOrPhone.includes("@")
      ? await prisma.user.findUnique({ where: { email: emailOrPhone.toLowerCase() }, select: SESSION_USER_SELECT })
      : await prisma.user.findFirst({ where: { phone: emailOrPhone, active: true }, select: SESSION_USER_SELECT });

    if (!user) return fail("Invalid credentials", 401);
    if (!user.active) return fail("This account has been deactivated", 403);
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return fail("Invalid credentials", 401);

    // P0 Batch 3 (A13): 2FA is opt-in per admin/owner. When enabled, the
    // password step does NOT create a session — the client must complete
    // the second step (POST /api/auth/login/totp) with a valid code.
    if (user.totpEnabled && user.totpSecret) {
      return ok({ totpRequired: true, userId: user.id });
    }

    await setSessionCookie(
      await createSession(user.id, user.role as "owner" | "admin" | "user", user.sessionVersion),
    );
    return ok({ user: publicUser(user) });
  } catch (err) {
    return toErrorResponse(err);
  }
}
