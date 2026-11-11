import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession, setSessionCookie } from "@/lib/auth";
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
    // users sign in by email.
    const user = emailOrPhone.includes("@")
      ? await prisma.user.findUnique({ where: { email: emailOrPhone.toLowerCase() } })
      : await prisma.user.findFirst({ where: { phone: emailOrPhone, active: true } });

    if (!user) return fail("Invalid credentials", 401);
    if (!user.active) return fail("This account has been deactivated", 403);
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return fail("Invalid credentials", 401);

    await setSessionCookie(await createSession(user.id, user.role as "owner" | "admin" | "user"));
    return ok({ user: publicUser(user) });
  } catch (err) {
    return toErrorResponse(err);
  }
}
