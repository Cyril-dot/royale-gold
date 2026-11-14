// P1 Batch 3 (O17): the owner's RTP monitor — per-game actual RTP
// against the base RTP the tiles print. READ-ONLY: it changes no
// game's maths or limits. See src/lib/rtp.ts for the flag rules
// (50+ rounds, 10+ points off base) and the skill-game caveat.
import { requireRole } from "@/lib/auth";
import { ok, toErrorResponse } from "@/lib/http";
import { parseOwnerRange } from "@/lib/revenue";
import { rtpMonitor } from "@/lib/rtp";

export async function GET(req: Request) {
  try {
    await requireRole("owner");
    const sp = new URL(req.url).searchParams;
    const { from, to } = parseOwnerRange(sp);
    return ok(await rtpMonitor(from, to));
  } catch (err) {
    return toErrorResponse(err);
  }
}
