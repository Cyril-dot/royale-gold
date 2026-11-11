import { getSessionUser } from "@/lib/auth";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { publicUser } from "@/lib/serialize";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Not signed in", 401);
    return ok({ user: publicUser(user) });
  } catch (err) {
    return toErrorResponse(err);
  }
}
