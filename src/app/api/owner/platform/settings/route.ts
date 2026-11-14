// P1 Batch 4 (O21): platform settings & branding — the site name, the
// support contact, and maintenance mode. These are the settings NOT
// already covered by the Wallet config section (which edits the money
// fields) or the global kill switch. Owner only; every change is
// written to the AuditLog.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { getPlatformSettings } from "@/lib/game-config";

export async function GET() {
  try {
    await requireRole("owner");
    const s = await getPlatformSettings();
    return ok({
      settings: {
        siteName: s.siteName,
        supportContact: s.supportContact,
        maintenanceMode: s.maintenanceMode,
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const owner = await requireRole("owner");
    const body = await readJson<{ siteName?: string; supportContact?: string; maintenanceMode?: boolean }>(req);
    if (!body) return fail("Invalid JSON body");
    const changes: string[] = [];
    const data: { siteName?: string; supportContact?: string; maintenanceMode?: boolean } = {};
    if (body.siteName !== undefined) {
      const name = body.siteName.trim();
      if (name.length < 1 || name.length > 60) return fail("siteName must be 1–60 characters");
      data.siteName = name;
      changes.push(`site name → "${name}"`);
    }
    if (body.supportContact !== undefined) {
      const contact = body.supportContact.trim();
      if (contact.length > 120) return fail("supportContact must be at most 120 characters");
      data.supportContact = contact;
      changes.push(contact ? `support contact → "${contact}"` : "support contact cleared");
    }
    if (body.maintenanceMode !== undefined) {
      if (typeof body.maintenanceMode !== "boolean") return fail("maintenanceMode must be true or false");
      data.maintenanceMode = body.maintenanceMode;
      changes.push(`maintenance mode ${body.maintenanceMode ? "ON" : "OFF"}`);
    }
    if (changes.length === 0) return fail("Nothing to update");
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.platformSettings.upsert({
        where: { id: "global" },
        update: data,
        create: { id: "global", ...data },
      });
      await tx.auditLog.create({
        data: {
          actorId: owner.id,
          action: "platform.settings",
          targetId: "global",
          detail: `Platform settings: ${changes.join("; ")}`,
        },
      });
      return row;
    });
    return ok({
      settings: {
        siteName: updated.siteName,
        supportContact: updated.supportContact,
        maintenanceMode: updated.maintenanceMode,
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
