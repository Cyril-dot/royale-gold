// Admin dashboard — Player detail, Games tab (Phase 5). Same server
// wrapper pattern as the Overview tab: the id is only known at request
// time, so this route renders on demand.
// instant = false: this route renders on demand (blocking), not as a
// prerendered static page.

export const instant = false;

import { Suspense } from "react";
import AdminPlayerDetail from "../../../../../components/AdminPlayerDetail";

export default async function AdminPlayerGamesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <AdminPlayerDetail id={id} tab="games" />
    </Suspense>
  );
}
