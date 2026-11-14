import { getSessionUser } from "@/lib/auth";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { publicUser } from "@/lib/serialize";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Not signed in", 401);
    return ok({ user: publicUser(user) });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * Update the signed-in user's profile: name and/or contact and/or
 * birthday. Contact follows the register model — one contact only: an
 * email (lowercased, unique) or a phone. Switching contact type clears
 * the other field. Birthday is optional (YYYY-MM-DD, or "" to clear);
 * the loyalty birthday bonus pays on it, once per year.
 */
export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Not signed in", 401);
    const body = await readJson<{ name?: string; emailOrPhone?: string; birthday?: string }>(req);
    if (!body) return fail("Invalid JSON body");
    const data: { name?: string; email?: string | null; phone?: string | null; birthday?: Date | null } = {};
    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) return fail("Name cannot be empty");
      if (name.length > 60) return fail("Name is too long (max 60 characters)");
      data.name = name;
    }
    if (body.emailOrPhone !== undefined) {
      const contact = body.emailOrPhone.trim();
      if (!contact) return fail("Email or phone cannot be empty");
      if (contact.includes("@")) {
        const email = contact.toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter a valid email address");
        const taken = await prisma.user.findUnique({ where: { email } });
        if (taken && taken.id !== user.id) return fail("That email is already in use", 409);
        data.email = email;
        data.phone = null;
      } else {
        const digits = contact.replace(/[\s()-]/g, "");
        if (!/^\+?\d{7,15}$/.test(digits)) return fail("Enter a valid phone number");
        data.phone = contact;
        data.email = null;
      }
    }
    if (body.birthday !== undefined) {
      const raw = body.birthday.trim();
      if (raw === "") {
        data.birthday = null;
      } else {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fail("Birthday must be a date (YYYY-MM-DD)");
        const d = new Date(`${raw}T00:00:00Z`);
        if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) {
          return fail("That birthday is not a real date");
        }
        if (d.getTime() > Date.now()) return fail("Birthday cannot be in the future");
        if (d.getUTCFullYear() < 1900) return fail("Birthday looks wrong — before 1900");
        data.birthday = d;
      }
    }
    if (Object.keys(data).length === 0) return fail("Nothing to update");
    const updated = await prisma.user.update({ where: { id: user.id }, data });
    return ok({ user: publicUser(updated) });
  } catch (err) {
    return toErrorResponse(err);
  }
}
