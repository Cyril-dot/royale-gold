// Owner email sender — customer list (Nov 2026): GET → every active
// player (role "user") with an email on file, for the "Choose
// customers" picker. Owner only.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/http";

const PICKER_CAP = 500;

export async function GET() {
  try {
    await requireRole("owner");
    const [customers, total] = await Promise.all([
      prisma.user.findMany({
        where: { role: "user", active: true, email: { not: null } },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
        take: PICKER_CAP,
      }),
      prisma.user.count({
        where: { role: "user", active: true, email: { not: null } },
      }),
    ]);
    return ok({ customers, total, capped: total > PICKER_CAP });
  } catch (err) {
    return toErrorResponse(err);
  }
}
