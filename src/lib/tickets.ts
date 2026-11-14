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

/** Close a ticket (shared by the admin route and the owner-preview route). */export async function closeTicketById(ticketId: string, actorId: string) {
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

export interface AdminTicketStats {
  adminId: string;
  adminName: string;
  open: number;
  answered: number;
  closed: number;
  unanswered: number;
  /** Average hours from ticket creation to the first admin reply, over
   * tickets that HAVE one. Null when no ticket has a reply yet. */
  avgFirstResponseHours: number | null;
}

export interface OwnerTicketOverview {
  /** Every ticket that is not closed, oldest first. */
  openTickets: (TicketRow & { ageHours: number })[];
  stats: AdminTicketStats[];
  totals: { open: number; answered: number; closed: number; unanswered: number };
}

/**
 * P1 Batch 4 (O23): the owner's support oversight — every open ticket
 * platform-wide + per-admin counts + average first-response time.
 * First response = the first message with senderRole "admin" after the
 * ticket was created; a ticket with no admin reply yet counts as
 * unanswered. All figures come from the real Ticket / TicketMessage
 * tables; nothing is invented.
 */
export async function ownerTicketOverview(): Promise<OwnerTicketOverview> {
  const now = Date.now();
  const [tickets, admins] = await Promise.all([
    prisma.ticket.findMany({
      where: { status: { not: "closed" } },
      include: {
        user: { select: { name: true, email: true, phone: true } },
        admin: { select: { name: true } },
        _count: { select: { messages: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 200,
    }),
    prisma.user.findMany({
      where: { role: "admin" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const openTickets = await Promise.all(
    tickets.map(async (t) => ({
      ...(await serializeTicket(t)),
      ageHours: Math.round(((now - t.createdAt.getTime()) / 3_600_000) * 10) / 10,
    })),
  );

  // Per-admin stats: counts by status + first-response time.
  const allTickets = await prisma.ticket.findMany({
    select: { id: true, adminId: true, status: true, createdAt: true },
  });
  const messages = await prisma.ticketMessage.findMany({
    where: { senderRole: "admin" },
    select: { ticketId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const firstReplyAt = new Map<string, Date>();
  for (const m of messages) {
    if (!firstReplyAt.has(m.ticketId)) firstReplyAt.set(m.ticketId, m.createdAt);
  }
  const stats: AdminTicketStats[] = admins.map((a) => {
    const mine = allTickets.filter((t) => t.adminId === a.id);
    const withReply = mine.filter((t) => firstReplyAt.has(t.id));
    const responseHours = withReply.map(
      (t) => (firstReplyAt.get(t.id)!.getTime() - t.createdAt.getTime()) / 3_600_000,
    );
    const avg =
      responseHours.length === 0
        ? null
        : Math.round((responseHours.reduce((s, h) => s + h, 0) / responseHours.length) * 10) / 10;
    return {
      adminId: a.id,
      adminName: a.name,
      open: mine.filter((t) => t.status === "open").length,
      answered: mine.filter((t) => t.status === "answered").length,
      closed: mine.filter((t) => t.status === "closed").length,
      unanswered: mine.filter((t) => t.status !== "closed" && !firstReplyAt.has(t.id)).length,
      avgFirstResponseHours: avg,
    };
  });
  return {
    openTickets,
    stats,
    totals: {
      open: allTickets.filter((t) => t.status === "open").length,
      answered: allTickets.filter((t) => t.status === "answered").length,
      closed: allTickets.filter((t) => t.status === "closed").length,
      unanswered: allTickets.filter((t) => t.status !== "closed" && !firstReplyAt.has(t.id)).length,
    },
  };
}

/**
 * P1 Batch 4 (O23): reassign a ticket to a different admin. Writes a
 * TicketMessage "Reassigned to {admin}" so the history shows it, plus
 * an AuditLog row. The ticket's status is left as-is (a reassigned
 * open ticket stays open). Returns null when the ticket or the new
 * admin does not exist.
 */
export async function reassignTicket(
  ticketId: string,
  newAdminId: string,
  ownerId: string,
): Promise<boolean> {
  const [t, admin] = await Promise.all([
    prisma.ticket.findUnique({ where: { id: ticketId } }),
    prisma.user.findUnique({ where: { id: newAdminId } }),
  ]);
  if (!t || !admin || admin.role !== "admin") return false;
  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({ where: { id: ticketId }, data: { adminId: newAdminId } });
    await tx.ticketMessage.create({
      data: {
        ticketId,
        senderId: ownerId,
        senderRole: "admin",
        body: `Reassigned to ${admin.name}`,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: ownerId,
        action: "ticket.reassign",
        targetId: ticketId,
        detail: `Reassigned ticket "${t.subject}" to ${admin.name}`,
      },
    });
  });
  return true;
}
