// P0 Batch 2 (O9/O10/O11): update one game's owner config. Body fields
// are all optional; a numeric field set to null CLEARS the override
// (back to the catalogue default). Every change is written to the
// AuditLog with what actually changed.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { getGame } from "@/lib/games";
import { validMoneyForGame } from "@/lib/game-config";
import { round2 } from "@/lib/money";

type Body = {
  visible?: boolean;
  killed?: boolean;
  minBet?: number | null;
  maxBet?: number | null;
  maxPayout?: number | null;
  maxMultiplier?: number | null;
};

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const owner = await requireRole("owner");
    const { slug } = await params;
    const game = getGame(slug);
    if (!game) return fail(`Unknown game: ${slug}`, 404);
    const body = await readJson<Body>(req);
    if (!body) return fail("Invalid JSON body");

    const changes: string[] = [];
    const data: {
      visible?: boolean;
      killed?: boolean;
      minBet?: number | null;
      maxBet?: number | null;
      maxPayout?: number | null;
      maxMultiplier?: number | null;
    } = {};

    if (typeof body.visible === "boolean") {
      data.visible = body.visible;
      changes.push(body.visible ? "shown" : "hidden");
    }
    if (typeof body.killed === "boolean") {
      data.killed = body.killed;
      changes.push(body.killed ? "killed" : "unkilled");
    }
    for (const key of ["minBet", "maxBet", "maxPayout"] as const) {
      if (key in body) {
        const v = body[key];
        if (v === null) {
          data[key] = null;
          changes.push(`${key} cleared`);
        } else if (validMoneyForGame(game.currency, v)) {
          data[key] = game.currency === "coins" ? Math.floor(v) : round2(v);
          changes.push(`${key} = ${game.currency === "coins" ? Math.floor(v) : round2(v)}`);
        } else {
          return fail(`${key} must be a valid ${game.currency === "coins" ? "whole-coin" : "GH₵"} amount (>= 0)`);
        }
      }
    }
    if ("maxMultiplier" in body) {
      const v = body.maxMultiplier;
      if (v === null) {
        data.maxMultiplier = null;
        changes.push("max multiplier cleared");
      } else if (typeof v === "number" && Number.isFinite(v) && v > 0) {
        data.maxMultiplier = round2(v);
        changes.push(`max multiplier = ×${round2(v)}`);
      } else {
        return fail("maxMultiplier must be a number > 0");
      }
    }
    if (changes.length === 0) return fail("Nothing to update");
    // Validate min <= max against the MERGED values (the row may
    // already hold the other bound from an earlier save).
    const existing = await prisma.gameConfig.findUnique({ where: { slug } });
    const mergedMin =
      "minBet" in body ? data.minBet : existing?.minBet == null ? null : Number(existing.minBet.toString());
    const mergedMax =
      "maxBet" in body ? data.maxBet : existing?.maxBet == null ? null : Number(existing.maxBet.toString());
    if (mergedMin != null && mergedMax != null && mergedMin > mergedMax) {
      return fail("Minimum bet cannot be above the maximum bet");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.gameConfig.upsert({
        where: { slug },
        create: { slug, updatedBy: owner.id, ...data },
        update: { ...data, updatedBy: owner.id },
      });
      const action =
        typeof body.killed === "boolean"
          ? body.killed
            ? "game.kill"
            : "game.unkill"
          : typeof body.visible === "boolean"
            ? body.visible
              ? "game.show"
              : "game.hide"
            : "game.economics";
      await tx.auditLog.create({
        data: {
          actorId: owner.id,
          action,
          targetId: slug,
          detail: `${game.name}: ${changes.join(", ")}`,
        },
      });
      return row;
    });

    return ok({
      slug: updated.slug,
      visible: updated.visible,
      killed: updated.killed,
      minBet: updated.minBet == null ? null : Number(updated.minBet.toString()),
      maxBet: updated.maxBet == null ? null : Number(updated.maxBet.toString()),
      maxPayout: updated.maxPayout == null ? null : Number(updated.maxPayout.toString()),
      maxMultiplier: updated.maxMultiplier == null ? null : Number(updated.maxMultiplier.toString()),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
