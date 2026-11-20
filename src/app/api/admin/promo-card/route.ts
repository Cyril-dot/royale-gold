// Admin promo card — data (Nov 2026): GET → the admin's live promo
// codes (not expired, uses left) to feature on the shareable promo
// card, plus the real site link. Modelled on /api/admin/promo-codes:
// an admin sees their own codes (needs the "promo" section), the owner
// previews one admin with ?adminId=. No new table — PromoCode already
// exists. When the admin has no live code the card is a branded join
// card (never an invented promo).
import { requireRole } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { dec } from "@/lib/money";

export const SITE_URL = "https://www.royalegolld.com";

export async function GET(req: Request) {
  try {
    const me = await requireRole("admin", "owner");
    const sp = new URL(req.url).searchParams;
    const adminId = me.role === "admin" ? me.id : sp.get("adminId") || undefined;
    if (me.role === "admin") requirePermission(me, "promo");
    if (!adminId) return fail("adminId is required");
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
      select: { name: true },
    });
    if (!admin) return fail("Admin not found", 404);
    const codes = await prisma.promoCode.findMany({
      where: { createdByAdminId: adminId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        code: true,
        bonusAmount: true,
        bonusCurrency: true,
        maxUses: true,
        uses: true,
        expiresAt: true,
        createdAt: true,
      },
    });
    const now = Date.now();
    const live = codes.filter(
      (c) => (!c.expiresAt || c.expiresAt.getTime() >= now) && c.uses < c.maxUses,
    );
    return ok({
      adminName: admin.name,
      siteUrl: SITE_URL,
      totalCodes: codes.length,
      codes: live.map((c) => ({
        id: c.id,
        code: c.code,
        bonusAmount: dec(c.bonusAmount),
        bonusCurrency: c.bonusCurrency,
        usesLeft: Math.max(0, c.maxUses - c.uses),
        expiresAt: c.expiresAt?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
