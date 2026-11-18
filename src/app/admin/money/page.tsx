// Admin dashboard — Money index (Phase 5). /admin/money is now three
// real routes (Chuks's tab rule: each tab is its own page) — this index
// redirects to the withdrawals queue, preserving the owner preview.
import { redirect } from "next/navigation";

export const instant = false;

export default async function AdminMoneyRedirect({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const sp = await searchParams;
  redirect(sp.preview ? `/admin/money/withdrawals?preview=${sp.preview}` : "/admin/money/withdrawals");
}
