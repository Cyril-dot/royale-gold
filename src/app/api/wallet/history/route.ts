import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, toErrorResponse } from "@/lib/http";
import { dec } from "@/lib/money";

/**
 * Player wallet deposits for the wallet History (newest first, max 100).
 *
 * Three sources, one list:
 * - DepositEvent rows — the canonical credited deposits (PayTeller,
 *   Theteller and demo all write one, atomically with the wallet
 *   credit, so a DepositEvent means the money landed).
 * - PaytellerPayment rows that are NOT successful — a pending,
 *   processing, failed or expired checkout has no DepositEvent yet
 *   (the credit is what creates one), so it is listed from the
 *   payment row itself. Successful ones are NOT listed twice: their
 *   DepositEvent already covers them.
 * - ThetellerPayment rows that are NOT successful — same rule.
 * - FlutterwavePayment rows that are NOT successful — same rule
 *   (Nov 2026, Nigeria only). The credit writes a DepositEvent with
 *   method "Flutterwave", so successful ones are covered by that row.
 *
 * Reads are P2021/P2022-safe: a table that does not exist yet in prod
 * degrades to "no rows from that source", never a 500.
 */

type DepositStatus = "successful" | "pending" | "processing" | "failed" | "expired";

interface DepositRow {
  id: string;
  kind: "deposit";
  amount: number;
  method: string;
  fiatCurrency: string;
  status: DepositStatus;
  createdAt: string;
}

function isMissingTable(err: unknown): boolean {
  const code = (err as { code?: string }).code;
  return code === "P2021" || code === "P2022";
}

const THETELLER_NETWORK_NAMES: Record<string, string> = {
  MTN: "MTN",
  VDF: "Telecel",
  ATL: "AirtelTigo",
  TGO: "Tigo",
};

function paytellerStatus(status: string): DepositStatus {
  if (status === "successful") return "successful";
  if (status === "processing") return "processing";
  if (status === "failed") return "failed";
  if (status === "expired") return "expired";
  return "pending";
}

export async function GET(req: Request) {
  try {
    const user = await requireAuth();
    const limit = Math.min(Math.max(Number(new URL(req.url).searchParams.get("limit") ?? 50) || 50, 1), 100);
    const [events, payteller, theteller, flutterwave] = await Promise.all([
      prisma.depositEvent
        .findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
          take: limit,
          select: {
            id: true,
            amount: true,
            method: true,
            fiatCurrency: true,
            providerPayload: true,
            createdAt: true,
          },
        })
        .catch((err) => {
          if (isMissingTable(err)) return [];
          throw err;
        }),
      prisma.paytellerPayment
        .findMany({
          where: { userId: user.id, status: { not: "successful" } },
          orderBy: { createdAt: "desc" },
          take: limit,
          select: { id: true, amount: true, fiatCurrency: true, status: true, createdAt: true },
        })
        .catch((err) => {
          if (isMissingTable(err)) return [];
          throw err;
        }),
      prisma.thetellerPayment
        .findMany({
          where: { userId: user.id, status: { not: "successful" } },
          orderBy: { createdAt: "desc" },
          take: limit,
          select: {
            id: true,
            amount: true,
            fiatCurrency: true,
            status: true,
            network: true,
            createdAt: true,
          },
        })
        .catch((err) => {
          if (isMissingTable(err)) return [];
          throw err;
        }),
      // Nov 2026 Flutterwave v3 (Nigeria only): the same not-successful
      // rule as PayTeller — a pending / processing / failed checkout
      // has no DepositEvent yet.
      prisma.flutterwavePayment
        .findMany({
          where: { userId: user.id, status: { not: "successful" } },
          orderBy: { createdAt: "desc" },
          take: limit,
          select: { id: true, amount: true, fiatCurrency: true, status: true, createdAt: true },
        })
        .catch((err) => {
          if (isMissingTable(err)) return [];
          throw err;
        }),
    ]);
    const rows: DepositRow[] = [
      ...events.map((e) => ({
        id: `dep-${e.id}`,
        kind: "deposit" as const,
        amount: dec(e.amount),
        // Demo deposits store the network as the method (MTN / Telecel /
        // AirtelTigo / card) with no provider payload; gateway deposits
        // store "PayTeller" / "Theteller" with the verified payload.
        method: e.providerPayload
          ? e.method
          : ["MTN", "Telecel", "AirtelTigo", "card"].includes(e.method)
            ? `Demo · ${e.method === "card" ? "Card" : e.method}`
            : e.method,
        fiatCurrency: e.fiatCurrency ?? "GHS",
        status: "successful" as const,
        createdAt: e.createdAt.toISOString(),
      })),
      ...payteller.map((p) => ({
        id: `pt-${p.id}`,
        kind: "deposit" as const,
        amount: dec(p.amount),
        method: "PayTeller",
        fiatCurrency: p.fiatCurrency ?? "GHS",
        status: paytellerStatus(p.status),
        createdAt: p.createdAt.toISOString(),
      })),
      ...theteller.map((t) => ({
        id: `th-${t.id}`,
        kind: "deposit" as const,
        amount: dec(t.amount),
        method: `Theteller · ${THETELLER_NETWORK_NAMES[t.network] ?? t.network}`,
        fiatCurrency: t.fiatCurrency ?? "GHS",
        status: (t.status === "failed" ? "failed" : "pending") as DepositStatus,
        createdAt: t.createdAt.toISOString(),
      })),
      ...flutterwave.map((f) => ({
        id: `flw-${f.id}`,
        kind: "deposit" as const,
        amount: dec(f.amount),
        method: "Flutterwave",
        fiatCurrency: f.fiatCurrency ?? "NGN",
        status: paytellerStatus(f.status),
        createdAt: f.createdAt.toISOString(),
      })),
    ];
    rows.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    return ok({ deposits: rows.slice(0, limit) });
  } catch (err) {
    return toErrorResponse(err);
  }
}
