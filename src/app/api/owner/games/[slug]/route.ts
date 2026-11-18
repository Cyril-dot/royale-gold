// P0 Batch 2 (O9/O10/O11): update one game's owner config. Body fields
// are all optional; a numeric field set to null CLEARS the override
// (back to the catalogue default). Every change is written to the
// AuditLog with what actually changed.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok, readJson, toErrorResponse } from "@/lib/http";
import { getGame } from "@/lib/games";
import { getGameWinChance, validMoneyForGame } from "@/lib/game-config";
import { PLAY_GATED_GAMES } from "@/lib/play";
import { round2 } from "@/lib/money";

/** Prisma P2021 = table missing, P2022 = column missing — both mean
 * "this database predates the feature" (the 17 Nov owner-500s lesson). */
function isMissingTable(err: unknown): boolean {
  const code = (err as { code?: string }).code;
  return code === "P2021" || code === "P2022";
}

type Body = {
  visible?: boolean;
  killed?: boolean;
  minBet?: number | null;
  maxBet?: number | null;
  maxPayout?: number | null;
  maxMultiplier?: number | null;
  // Win controls (Nov 2026): the owner's per-game win chance (%) —
  // null CLEARS it (back to today's behaviour). Only enforced for
  // server-drawn games (PLAY_GATED_GAMES); saving one for any other
  // game is rejected below, so a stored value can never promise what
  // the code cannot deliver.
  winChancePct?: number | null;
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
      winChancePct?: number | null;
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
    // Win controls (Nov 2026): a win chance is only meaningful where
    // the server draws the outcome. Any other game decides wins in
    // the room, so accepting a value for it would store a promise the
    // code cannot keep — rejected with a plain 400 instead.
    if ("winChancePct" in body) {
      if (!PLAY_GATED_GAMES.has(slug)) {
        return fail("Win chance is only enforced for server-drawn games — Royale Roulette today");
      }
      const v = body.winChancePct;
      if (v === null) {
        data.winChancePct = null;
        changes.push("win chance cleared");
      } else if (typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 100 && Math.abs(round2(v) - v) < 1e-9) {
        data.winChancePct = round2(v);
        changes.push(`win chance = ${round2(v)}%`);
      } else {
        return fail("winChancePct must be a percent above 0 and at most 100");
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
      // winChancePct lives in its own table (GameWinChance) — it must
      // NOT reach the GameConfig upsert (unknown argument).
      const { winChancePct, ...gameData } = data;
      const row = await tx.gameConfig.upsert({
        where: { slug },
        create: { slug, updatedBy: owner.id, ...gameData },
        update: { ...gameData, updatedBy: owner.id },
      });
      // Win controls (Nov 2026): the chance lives in its own table
      // (GameWinChance) — GameConfig is read unselected, so a column
      // there would 500 prod reads until the SQL runs. A missing table
      // in prod throws P2021 here → plain 503, never a 500.
      if ("winChancePct" in body) {
        try {
          if (winChancePct === null || winChancePct === undefined) {
            await tx.gameWinChance.deleteMany({ where: { slug } });
          } else {
            await tx.gameWinChance.upsert({
              where: { slug },
              update: { chancePct: winChancePct },
              create: { slug, chancePct: winChancePct },
            });
          }
        } catch (err) {
          if (isMissingTable(err)) {
            throw new Error("Win chances are not set up yet — run rg-win-controls.sql in Neon first");
          }
          throw err;
        }
      }
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
      winChancePct: await getGameWinChance(slug),
    });
  } catch (err) {
    // Missing GameWinChance table in prod → plain 503, never a 500.
    if (err instanceof Error && err.message.includes("rg-win-controls.sql")) {
      return fail(err.message, 503);
    }
    return toErrorResponse(err);
  }
}
