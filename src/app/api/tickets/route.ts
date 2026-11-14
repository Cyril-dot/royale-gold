// P0 Batch 3 (A11): the player's side of support tickets. A signed-in
// player opens a ticket from the account page (subject + first message);
// it is assigned to their referring admin (null when they were not
// referred — the owner sees those). GET lists the player's own tickets.
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { listTicketsForUser, ticketDetail } from "@/lib/tickets";

export async function GET() {
  try {
    const user = await requireAuth();
    return ok({ tickets: await listTicketsForUser(user.id) });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await readJson<{ subject?: string; body?: string }>(req);
    const subject = (body?.subject ?? "").trim();
    const text = (body?.body ?? "").trim();
    if (subject.length < 3) return fail("A subject is required (at least 3 characters)");
    if (subject.length > 120) return fail("Subject is too long (max 120 characters)");
    if (text.length < 3) return fail("Please describe the problem (at least 3 characters)");
    if (text.length > 2000) return fail("Message is too long (max 2000 characters)");

    const me = await prisma.user.findUnique({ where: { id: user.id } });
    const adminId = me?.referredByAdminId ?? null;
    const created = await prisma.$transaction(async (tx) => {
      const t = await tx.ticket.create({
        data: { userId: user.id, adminId, subject, status: "open" },
      });
      await tx.ticketMessage.create({
        data: { ticketId: t.id, senderId: user.id, senderRole: "user", body: text },
      });
      await tx.auditLog.create({
        data: { actorId: user.id, action: "ticket.create", targetId: t.id, detail: `Opened ticket "${subject}"` },
      });
      return t;
    });
    return ok(await ticketDetail(created.id), 201);
  } catch (err) {
    return toErrorResponse(err);
  }
}
