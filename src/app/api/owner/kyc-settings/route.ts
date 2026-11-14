// P1 Batch 4 (O22): owner KYC/AML settings — the accepted document
// types, the auto-approve rule (URL-host allow-list), and the deposit
// threshold above which KYC is required before a withdrawal can be
// approved (a warning flag on the queue, never a block). Owner only;
// every change is written to the AuditLog.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { getKycSettings, validateKycSettings } from "@/lib/kyc-settings";
import { dec } from "@/lib/money";

export async function GET() {
  try {
    await requireRole("owner");
    const s = await getKycSettings();
    return ok({ settings: s });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const owner = await requireRole("owner");
    const body = await readJson<{
      acceptedTypes?: string[];
      autoApprove?: boolean;
      autoApproveHosts?: string;
      withdrawalKycThreshold?: number;
    }>(req);
    if (!body) return fail("Invalid JSON body");
    const err = validateKycSettings(body);
    if (err) return fail(err);
    const data: { acceptedTypes?: string; autoApprove?: boolean; autoApproveHosts?: string; withdrawalKycThreshold?: number } = {};
    const changes: string[] = [];
    if (body.acceptedTypes !== undefined) {
      data.acceptedTypes = body.acceptedTypes.join(",");
      changes.push(`accepted document types → ${data.acceptedTypes}`);
    }
    if (body.autoApprove !== undefined) {
      data.autoApprove = body.autoApprove;
      changes.push(`auto-approve ${body.autoApprove ? "ON" : "OFF"}`);
    }
    if (body.autoApproveHosts !== undefined) {
      data.autoApproveHosts = body.autoApproveHosts.trim();
      changes.push(`auto-approve hosts → ${data.autoApproveHosts || "(none)"}`);
    }
    if (body.withdrawalKycThreshold !== undefined) {
      data.withdrawalKycThreshold = Number(body.withdrawalKycThreshold);
      changes.push(`withdrawal KYC threshold → GH₵ ${dec(data.withdrawalKycThreshold).toFixed(2)}`);
    }
    if (changes.length === 0) return fail("Nothing to update");
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.kycSettings.upsert({
        where: { id: "global" },
        update: data,
        create: {
          id: "global",
          acceptedTypes: data.acceptedTypes ?? "national_id,passport,drivers_licence",
          autoApprove: data.autoApprove ?? false,
          autoApproveHosts: data.autoApproveHosts ?? "",
          withdrawalKycThreshold: data.withdrawalKycThreshold ?? 0,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: owner.id,
          action: "kyc.settings",
          targetId: "global",
          detail: `KYC/AML settings: ${changes.join("; ")}`,
        },
      });
      return row;
    });
    return ok({
      settings: {
        acceptedTypes: updated.acceptedTypes.split(",").filter(Boolean),
        autoApprove: updated.autoApprove,
        autoApproveHosts: updated.autoApproveHosts
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        withdrawalKycThreshold: dec(updated.withdrawalKycThreshold),
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
