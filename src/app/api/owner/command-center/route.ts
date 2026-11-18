// Owner Command Center aggregate (Phase 2, staff redesign) — one call
// for the first screen: everything dashboard-stats returns (KPIs +
// deltas vs previous period + finChart + growthChart + activity +
// deposits7d + topAdmins) PLUS the alert strip and the pending counts.
// The KPI/chart figures are NOT recomputed here: this endpoint calls
// the dashboard-stats handler and merges its response, so the two can
// never disagree. Definitions are the metric doc's (per-currency
// aggregates, UTC days, "paid out" = approved withdrawals).
//   alerts: gateway failing / kill / maintenance / fraud spike /
//           anomaly / withdrawals over the owner-approval threshold.
//   pending: withdrawals (pending / awaiting owner / over threshold),
//            payouts due today (admins + amount), KYC queue, open
//            tickets, fraud + anomaly counts by severity.
//   ggrRange / ggrPrev: cash GGR (stakes − payouts, GameResult) for the
//            range and the previous period — from the P&L handler,
//            called in-process, never recomputed here.
//   activePlayersRange / activePlayersPrev: distinct players with a
//            deposit or a game round in the period (that fiat) —
//            "active" means they played or paid, not just registered.
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { todayStr } from "@/lib/money";
import { ok, toErrorResponse } from "@/lib/http";
import { commissionPaid, commissionSummary, totalCommissionOwed } from "@/lib/commission";
import { computeAnomalies } from "@/lib/anomalies";
import { computeOwnerFraud } from "@/lib/fraud";
import { getPlatformSettings, getAllCurrencyConfigs } from "@/lib/game-config";
import { getMaskedGatewaySettings } from "@/lib/gateway-settings";
import { GET as dashboardStats } from "../dashboard-stats/route";
import { GET as pnl } from "../pnl/route";

const DAY = 24 * 60 * 60 * 1000;
const dayStart = (date: string): Date => new Date(`${date}T00:00:00.000Z`);
const dayEnd = (date: string): Date => new Date(dayStart(date).getTime() + DAY);

export interface CommandCenterAlert {
  id: string;
  severity: "high" | "medium" | "info";
  label: string;
  href: string;
}

export async function GET(req: Request) {
  try {
    await requireRole("owner");
    const url = new URL(req.url);
    const params = url.searchParams;
    const fiatCurrency = (params.get("currency") || "GHS").toUpperCase();
    const today = todayStr();

    // KPIs + deltas + charts + activity + top admins: one source of
    // truth — the dashboard-stats handler, called in-process.
    const statsRes = await dashboardStats(
      new Request(
        `http://localhost/api/owner/dashboard-stats?currency=${encodeURIComponent(fiatCurrency)}`
          + `&from=${encodeURIComponent(params.get("from") || "")}`
          + `&to=${encodeURIComponent(params.get("to") || "")}`,
      ),
    );
    const stats = (await statsRes.json()) as Record<string, unknown>;
    const from = String(stats.from ?? today);
    const to = String(stats.to ?? today);
    const prevFrom = String(stats.prevFrom ?? today);
    const prevTo = String(stats.prevTo ?? today);

    // GGR (cash) for the range + the previous period, from the P&L
    // handler — same single source of truth as the P&L page.
    const pnlUrl = (f: string, t: string) =>
      `http://localhost/api/owner/pnl?currency=${encodeURIComponent(fiatCurrency)}&from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}`;
    const [pnlRange, pnlPrev] = await Promise.all([
      pnl(new Request(pnlUrl(from, to))).then((r) => r.json()) as Promise<{ ggrCash: number }>,
      pnl(new Request(pnlUrl(prevFrom, prevTo))).then((r) => r.json()) as Promise<{ ggrCash: number }>,
    ]);

    // Active players: distinct players with a deposit or a game round
    // in the period (that fiat). Two bounded distinct queries + a set
    // union — no full-table scan of users.
    const activeIn = async (f: string, t: string): Promise<number> => {
      const win = { gte: dayStart(f), lt: dayEnd(t) };
      const [deps, rounds] = await Promise.all([
        prisma.depositEvent.findMany({ where: { fiatCurrency, createdAt: win }, select: { userId: true }, distinct: ["userId"] }),
        prisma.gameResult.findMany({ where: { fiatCurrency, createdAt: win }, select: { userId: true }, distinct: ["userId"] }),
      ]);
      return new Set([...deps.map((d) => d.userId), ...rounds.map((r) => r.userId)]).size;
    };
    const [activeRange, activePrev] = await Promise.all([activeIn(from, to), activeIn(prevFrom, prevTo)]);

    const [pendingWithdrawals, awaitingOwner, overThresholdRows, kycPending, ticketsOpen, fraud, anomalies, platform, gateway, currencies] =
      await Promise.all([
        prisma.withdrawal.count({ where: { status: "pending", fiatCurrency } }),
        prisma.withdrawal.count({ where: { status: "admin_approved", fiatCurrency } }),
        prisma.withdrawal.findMany({
          where: { status: { in: ["pending", "admin_approved"] }, fiatCurrency },
          select: { amount: true },
        }),
        prisma.kycSubmission.count({ where: { status: "pending" } }),
        prisma.ticket.count({ where: { status: "open" } }),
        computeOwnerFraud(),
        computeAnomalies(),
        getPlatformSettings(),
        getMaskedGatewaySettings(),
        getAllCurrencyConfigs(),
      ]);
    const threshold =
      currencies.find((c) => c.currency === fiatCurrency)?.withdrawalOwnerThreshold ??
      (fiatCurrency === "NGN" ? 50000 : 500);
    const overThreshold = overThresholdRows.filter((w) => Number(w.amount) >= threshold).length;

    // Payouts due today: admins whose earned commission exceeds what
    // has been paid (same recompute the Payouts tab uses). The per-admin
    // summaries used to run one after another (Phase 7: N admins × 2
    // sequential round-trips); they are independent, so they run in one
    // Promise.all now. Same figures, same order — only the waiting
    // changes. No shape change, no money-logic change.
    const [owedToday, admins] = await Promise.all([
      totalCommissionOwed(today, today, fiatCurrency),
      prisma.user.findMany({ where: { role: "admin" }, select: { id: true } }),
    ]);
    const perAdmin = await Promise.all(
      admins.map(async (a) => {
        const [summary, paid] = await Promise.all([
          commissionSummary(a.id, fiatCurrency),
          commissionPaid(a.id, undefined, undefined, fiatCurrency),
        ]);
        return summary.today > 0 && summary.today > paid;
      }),
    );
    const payoutsDueAdmins = perAdmin.filter(Boolean).length;

    const alerts: CommandCenterAlert[] = [];
    if (gateway.ghMomoGateway === "payteller" && !gateway.paytellerConfigured) {
      alerts.push({
        id: "gateway-no-keys",
        severity: "high",
        label: "PayTeller has no keys — Ghana MoMo cannot take live payments.",
        href: "/owner/finance/gateway",
      });
    } else if (gateway.ghMomoGateway === "demo") {
      alerts.push({
        id: "gateway-demo",
        severity: "info",
        label: "Ghana MoMo is in Demo mode — no live payments.",
        href: "/owner/finance/gateway",
      });
    }
    if (platform.globalKill) {
      alerts.push({
        id: "global-kill",
        severity: "high",
        label: "Global kill is ON — all games are paused.",
        href: "/owner/settings/platform",
      });
    }
    if (platform.maintenanceMode) {
      alerts.push({
        id: "maintenance",
        severity: "medium",
        label: "Maintenance mode is ON.",
        href: "/owner/settings/platform",
      });
    }
    if (fraud.counts.high > 0) {
      alerts.push({
        id: "fraud-high",
        severity: "high",
        label: `${fraud.counts.high} high-severity fraud signal${fraud.counts.high === 1 ? "" : "s"} open.`,
        href: "/owner/reports/risk",
      });
    }
    if (anomalies.counts.high > 0) {
      alerts.push({
        id: "anomaly-high",
        severity: "high",
        label: `${anomalies.counts.high} high-severity anomaly alert${anomalies.counts.high === 1 ? "" : "s"}.`,
        href: "/owner/reports/risk",
      });
    }
    if (overThreshold > 0) {
      alerts.push({
        id: "wd-over-threshold",
        severity: "medium",
        label: `${overThreshold} withdrawal${overThreshold === 1 ? "" : "s"} over the owner-approval threshold waiting.`,
        href: "/owner/finance/withdrawals",
      });
    }

    return ok({
      ...stats,
      ggrRange: pnlRange.ggrCash,
      ggrPrev: pnlPrev.ggrCash,
      activePlayersRange: activeRange,
      activePlayersPrev: activePrev,
      alerts,
      pending: {
        withdrawalsPending: pendingWithdrawals,
        withdrawalsAwaitingOwner: awaitingOwner,
        withdrawalsOverThreshold: overThreshold,
        payoutsDueAdmins,
        payoutsDueAmount: owedToday,
        kycPending,
        ticketsOpen,
        fraudHigh: fraud.counts.high,
        fraudMedium: fraud.counts.medium,
        anomaliesHigh: anomalies.counts.high,
        anomaliesMedium: anomalies.counts.medium,
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
