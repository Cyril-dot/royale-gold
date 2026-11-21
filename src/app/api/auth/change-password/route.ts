import bcrypt from "bcryptjs";
import { getSessionUser } from "@/lib/auth";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

/** Change the signed-in user's password. Verifies the current one first. */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Not signed in", 401);
    const body = await readJson<{ currentPassword?: string; newPassword?: string }>(req);
    if (!body) return fail("Invalid JSON body");
    const { currentPassword, newPassword } = body;
    if (!currentPassword || !newPassword) {
      return fail("Enter your current password and a new password");
    }
    const match = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!match) return fail("Current password is incorrect", 403);
    if (newPassword.length < 6) return fail("New password must be at least 6 characters");
    if (newPassword === currentPassword) {
      return fail("New password must be different from the current one");
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash }, select: { id: true } });
    return ok({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
