import { requireAuth } from "@/lib/auth";
import { ok, toErrorResponse } from "@/lib/http";
import { dec } from "@/lib/money";
import { getWinnings, splitCash } from "@/lib/win-logic";

export async function GET() {
  try {
    const user = await requireAuth();
    // Win logic (Nov 2026): the Stake/Winnings split of the cash
    // balance. P2022-safe — a DB without the WinWallet table reads
    // all-Stake (winnings 0).
    const split = splitCash(dec(user.cashBalance), await getWinnings(user.id));
    return ok({
      cash: split.cash,
      coins: user.coins,
      sim: dec(user.simBalance),
      stake: split.stake,
      winnings: split.winnings,
      // Phase 1 country-based (Nov 2026): the wallet's fiat + country.
      currency: user.currency ?? "GHS",
      country: user.country ?? "GH",
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
