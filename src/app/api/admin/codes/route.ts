import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { normalizeCode, randomCode } from "@/lib/serialize";

export async function GET() {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "referrals");
    const codes = await prisma.referralCode.findMany({
      where: { adminId: admin.id },
      orderBy: { createdAt: "desc" },
    });
    return ok({
      codes: codes.map((c) => ({
        id: c.id,
        code: c.code,
        active: c.active,
        shareLink: `/register?ref=${c.code}`,
        createdAt: c.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireRole("admin");
    requirePermission(admin, "referrals");
    const body = await readJson<{ code?: string }>(req);
    let code = body?.code ? normalizeCode(body.code) : randomCode();
    if (!/^RG-[A-Z0-9]{4,12}$/.test(code)) {
      return fail("Custom codes must look like RG-XXXX (letters/digits after RG-)", 400);
    }
    // Auto-generated codes must be unique — retry a few times on collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await prisma.referralCode.findUnique({ where: { code } });
      if (!existing) break;
      if (body?.code) return fail("That code is already taken", 409);
      code = randomCode();
    }
    const created = await prisma.referralCode.create({
      data: { code, adminId: admin.id, active: true },
    });
    return ok(
      {
        id: created.id,
        code: created.code,
        active: created.active,
        shareLink: `/register?ref=${created.code}`,
        createdAt: created.createdAt.toISOString(),
      },
      201,
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
