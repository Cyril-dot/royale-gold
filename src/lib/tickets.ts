// P0 Batch 3 (A11): support tickets — tickets + replies only, no live
// chat. A player opens a ticket from the account page; it is assigned to
// their referring admin. An admin sees only their own players' tickets.
import { prisma } from "./prisma";

export type TicketStatus = "open" | "answered" | "closed";

export function isTicketStatus(v: string): v is TicketStatus {
  return v === "open" || v === "answered" || v === "closed";
}

export interface TicketRow {
  id: string;
  subject: string;
  status: string;
  userId: string;
  userName: string;
  userContact: string | null;
  adminId: string | null;
  adminName: string | null;
  messages: number;
  createdAt: string;
  updatedAt: string;
}

export async function serializeTicket(
  t: {
    id: string;
    subject: string;
    status: string;
    userId: string;
    adminId: string | null;
    createdAt: Date;
    updatedAt: Date;
    user: { name: string; email: string | null; phone: string | null };
    admin: { name: string } | null;
    _count?: { messages: number };
  },
): Promise<TicketRow> {
  return {
    id: t.id,
    subject: t.subject,
    status: t.status,
    userId: t.userId,
    userName: t.user.name,
    userContact: t.user.email ?? t.user.phone ?? null,
    adminId: t.adminId,
    adminName: t.admin?.name ?? null,
    messages: t._count?.messages ?? 0,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export async function listTicketsForAdmin(adminId: string, status?: string) {
  const rows = await prisma.ticket.findMany({
    where: { adminId, ...(status ? { status } : {}) },
    include: {
      user: { select: { name: true, email: true, phone: true } },
      admin: { select: { name: true } },
      _count: { select: { messages: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  return Promise.all(rows.map(serializeTicket));
}

export async function listTicketsForUser(userId: string) {
  const rows = await prisma.ticket.findMany({
    where: { userId },
    include: {
      user: { select: { name: true, email: true, phone: true } },
      admin: { select: { name: true } },
      _count: { select: { messages: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  return Promise.all(rows.map(serializeTicket));
}

export async function ticketDetail(ticketId: string) {
  const t = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      admin: { select: { id: true, name: true } },
      messages: {
        include: { sender: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!t) return null;
  return {
    id: t.id,
    subject: t.subject,
    status: t.status,
    userId: t.userId,
    userName: t.user.name,
    userContact: t.user.email ?? t.user.phone ?? null,
    adminId: t.adminId,
    adminName: t.admin?.name ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    messages: t.messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      senderName: m.sender.name,
      senderRole: m.senderRole,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

/**
 * Reply to a ticket (shared by the admin route and the owner-preview
 * route). senderId is the admin the reply comes from; actorId is who
 * actually sent it (the admin, or the owner replying in preview).
 */
export async function replyToTicket(ticketId: string, senderId: string, actorId: string, body: string) {
  const t = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!t) return null;
  await prisma.$transaction(async (tx) => {
    await tx.ticketMessage.create({
      data: { ticketId, senderId, senderRole: "admin", body },
    });
    await tx.ticket.update({ where: { id: ticketId }, data: { status: "answered" } });
    await tx.auditLog.create({
      data: { actorId, action: "ticket.reply", targetId: ticketId, detail: `Replied to ticket "${t.subject}"` },
    });
  });
  return ticketDetail(ticketId);
}

/** Close a ticket (shared by the admin route and the owner-preview route). */
export async function closeTicketById(ticketId: string, actorId: string) {
  const t = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!t) return null;
  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({ where: { id: ticketId }, data: { status: "closed" } });
    await tx.auditLog.create({
      data: { actorId, action: "ticket.close", targetId: ticketId, detail: `Closed ticket "${t.subject}"` },
    });
  });
  return ticketDetail(ticketId);
}
