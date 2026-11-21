// Phase 2 PayTeller (Nov 2026): the email-on-file flow (plan §2.5).
// Royale Gold allows phone-only registration, but PayTeller REQUIRES a
// valid customer_email and sends the receipt there.
//
// This endpoint sets ONLY the email — the phone stays on the account
// (unlike PATCH /api/auth/me, which follows the one-contact-only
// profile rule and would clear it). Format-validated only. No fake
// email is ever invented — a phone-only user who does not add one
// simply cannot use PayTeller; the demo cashier needs no email and
// keeps working for them.
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { publicUser } from "@/lib/serialize";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await readJson<{ email?: string }>(req);
    if (!body) return fail("Invalid JSON body");
    const email = (body.email ?? "").trim().toLowerCase();
    if (!email) return fail("Enter an email address");
    if (!EMAIL_RE.test(email)) return fail("Enter a valid email address");
    if (email === (user.email ?? "").toLowerCase()) {
      return ok({ user: publicUser(user) });
    }
    const taken = await prisma.user.findUnique({ where: { email } });
    if (taken && taken.id !== user.id) return fail("That email is already in use", 409);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { email },
    });
    return ok({ user: publicUser(updated) });
  } catch (err) {
    return toErrorResponse(err);
  }
}
