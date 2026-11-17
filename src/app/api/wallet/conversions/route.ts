// Nov 2026: the player's own conversion history, latest first — the
// convert page lists each conversion (cash in, coins out, date). There
// was no GET endpoint for conversions before (the wallet page said so
// in its own comment); this is it.
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/http";
import { dec } from "@/lib/money";

export async function GET() {
  try {
    const user = await requireAuth();
    const rows = await prisma.conversionEvent.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, cashDebited: true, coinsGained: true, fiatCurrency: true, createdAt: true },
    });
    return ok({
      conversions: rows.map((r) => ({
        ...r,
        cashDebited: dec(r.cashDebited),
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
