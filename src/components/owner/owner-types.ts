// Shared owner row types — moved verbatim from src/app/owner/page.tsx
// (Phase 2 split). No logic here.

export interface AdminRow {
  id: string; name: string; email: string; role: string; commissionPct: number | null; active: boolean;
  permissions: string[] | null; totpEnabled: boolean;
  codes: { id: string; code: string; active: boolean }[];
  referralCount: number; coinsGiven: number; commissionAllTime: number; createdAt: string;
  // Phase 1 country-based (Nov 2026): the admin's country + fiat;
  // commissionAllTime is in commissionCurrency (their own fiat).
  country?: string | null; currency?: string; commissionCurrency?: string;
  // P1 Batch 4 (O24): the admin's parent admin (a senior agent), if any.
  parentAdminId: string | null; parentName: string | null;
}
export interface RollupDay { date: string; adminId: string; adminName: string; deposits: number; totalAmount: number; totalCommission: number; fiatCurrency: string }
export interface OwnerDayAdmin { admin: { id: string; name: string }; deposits: { id: string; userId: string; userName: string; userContact: string; amount: number; method: string; fiatCurrency: string; pctInForce: number; commission: number; time: string }[]; totalAmount: number; totalCommission: number }
// P0 Batch 4 (O6): one row of the global player search.
export interface OwnerSearchPlayer { id: string; name: string; email: string | null; phone: string | null; role: string; country: string | null; currency: string; referringAdmin: { id: string; name: string } | null; totalDeposited: number; deposits: number; cash: number; coins: number; joinedAt: string }
