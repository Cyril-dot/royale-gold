// Deposit MoMo number (Nov 2026): the Account page reads and changes
// it here — the only place it can be changed. The deposit flow saves
// it through the create routes, never through this endpoint.
// GET → { depositPhone: string | null } (null = never set, or the
// table is missing in prod — never an error). POST { phone } → saves
// it (400 on a bad number, 503 naming rg-deposit-number.sql when the
// table is missing).
import { requireAuth } from "@/lib/auth";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import {
  getDepositPhone,
  normalizeDepositPhone,
  setDepositPhone,
} from "@/lib/deposit-number";

export async function GET() {
  try {
    const user = await requireAuth();
    const phone = await getDepositPhone(user.id);
    return ok({ depositPhone: phone });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await readJson<{ phone?: string }>(req);
    if (!body) return fail("Invalid JSON body");
    // Bad numbers are a 400 here (the helper throws a plain Error for
    // them, which would otherwise surface as a 500).
    if (!normalizeDepositPhone(body.phone)) {
      return fail("Enter a valid Ghana MoMo number (e.g. 0244 000 000)");
    }
    try {
      const phone = await setDepositPhone(user.id, body.phone ?? "");
      return ok({ depositPhone: phone });
    } catch (err) {
      if (err instanceof Error && err.message.includes("rg-deposit-number.sql")) {
        return fail(err.message, 503);
      }
      throw err;
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
