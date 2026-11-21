// Email sending (Nov 2026): Gmail SMTP via nodemailer.
//
// Env ONLY — never hardcode an address or password here:
//   SMTP_USER  — the Gmail address the code is sent FROM
//   SMTP_PASS  — a Gmail APP PASSWORD (Google Account → Security →
//                2-Step Verification → App passwords), NOT the
//                Gmail account password
//   SMTP_FROM  — optional From address (defaults to SMTP_USER)
//   SMTP_HOST / SMTP_PORT / SMTP_SECURE — optional overrides
//                (defaults: smtp.gmail.com:465, TLS). The local
//                verify rigs point these at a fake SMTP sink.
// Gmail's free daily sending limit is ~500 messages/day.
import nodemailer, { type Transporter } from "nodemailer";

export function mailerConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function createMailer(): Transporter {
  const host = process.env.SMTP_HOST ?? "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT ?? 465);
  const secure =
    process.env.SMTP_SECURE !== undefined
      ? process.env.SMTP_SECURE === "true"
      : port === 465;
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

/** An owner message to one customer — subject + text exactly as the
 *  owner typed them, plain text with a matching HTML version. */
export async function sendOwnerEmail(to: string, subject: string, text: string): Promise<void> {
  const mailer = createMailer();
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  await mailer.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to,
    subject,
    text: `${text}\n\n— Royale Gold`,
    html: `<p>${esc.replace(/\n/g, "<br>")}</p><p>— Royale Gold</p>`,
  });
}
