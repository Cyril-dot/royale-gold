// Owner email sender — send (Nov 2026): POST { mode, subject,
// message, userIds?, email? } → mail via the existing Gmail SMTP
// mailer. Owner only. Modes: "all" (every active player with an
// email), "selected" (picked customer ids), "any" (one typed email).
// One send covers at most 100 recipients — "all" sends to the first
// 100 (oldest accounts first) and says so in the result. No new
// table: one AuditLog row records each send. 503 when the mailer is
// not configured (set SMTP_USER + SMTP_PASS in Vercel first).
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { mailerConfigured, sendOwnerEmail } from "@/lib/mailer";
import { normalizeEmail } from "@/lib/serialize";

const SEND_CAP = 100;

export async function POST(req: Request) {
  try {
    const owner = await requireRole("owner");
    const body = await readJson<{
      mode?: string;
      subject?: string;
      message?: string;
      userIds?: unknown;
      email?: string;
    }>(req);
    if (!body) return fail("Invalid JSON body");
    const mode = body.mode ?? "";
    if (mode !== "all" && mode !== "selected" && mode !== "any") {
      return fail('mode must be "all", "selected" or "any"');
    }
    const subject = (body.subject ?? "").trim();
    if (subject.length < 1 || subject.length > 120) return fail("subject must be 1–120 characters");
    const message = (body.message ?? "").trim();
    if (message.length < 1 || message.length > 5000) return fail("message must be 1–5000 characters");
    if (!mailerConfigured()) {
      return fail("Email sending is not set up yet — set SMTP_USER and SMTP_PASS in Vercel first", 503);
    }

    let recipients: string[] = [];
    let totalMatching = 0;
    if (mode === "all") {
      totalMatching = await prisma.user.count({
        where: { role: "user", active: true, email: { not: null } },
      });
      const rows = await prisma.user.findMany({
        where: { role: "user", active: true, email: { not: null } },
        select: { email: true },
        orderBy: { createdAt: "asc" },
        take: SEND_CAP,
      });
      recipients = rows.map((r) => r.email).filter((e): e is string => e !== null);
    } else if (mode === "selected") {
      const ids = Array.isArray(body.userIds)
        ? body.userIds.filter((id): id is string => typeof id === "string")
        : [];
      if (ids.length < 1) return fail("Pick at least one customer");
      const rows = await prisma.user.findMany({
        where: { id: { in: ids.slice(0, SEND_CAP) }, role: "user", active: true, email: { not: null } },
        select: { email: true },
        orderBy: { createdAt: "asc" },
      });
      recipients = rows.map((r) => r.email).filter((e): e is string => e !== null);
      totalMatching = recipients.length;
    } else {
      const email = normalizeEmail(body.email);
      if (!email) return fail("Enter a valid email address");
      recipients = [email];
      totalMatching = 1;
    }
    if (recipients.length < 1) return fail("No customers with an email on file");

    // Sequential sends: predictable for the mailer and for Gmail's
    // limits, and one failure never stops the rest.
    const failed: string[] = [];
    for (const to of recipients) {
      try {
        await sendOwnerEmail(to, subject, message);
      } catch {
        failed.push(to);
      }
    }
    const sent = recipients.length - failed.length;
    const capped = totalMatching > recipients.length;
    await prisma.auditLog.create({
      data: {
        actorId: owner.id,
        action: "ownerMail.send",
        detail:
          `Sent "${subject}" to ${sent} of ${totalMatching} (${mode})` +
          (capped ? " — first 100 only" : "") +
          (failed.length > 0
            ? ` — failed: ${failed.slice(0, 5).join(", ")}${failed.length > 5 ? ` +${failed.length - 5} more` : ""}`
            : ""),
      },
    });
    return ok({ sent, failed, total: recipients.length, totalMatching, capped });
  } catch (err) {
    return toErrorResponse(err);
  }
}
