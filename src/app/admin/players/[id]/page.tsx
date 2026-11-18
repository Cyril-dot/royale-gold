// Admin dashboard — Player detail route (Phase 5). Server wrapper: the
// player id is a database id, so this route is dynamic — awaiting params
// here keeps Next from statically prerendering it. Each detail tab is
// its own route (Chuks's tab rule); this is the Overview tab. The client
// detail lives in src/components/AdminPlayerDetail.tsx.
// instant = false: this route renders on demand (blocking), not as a
// prerendered static page — the id is only known at request time.

export const instant = false;

import { Suspense } from "react";
import AdminPlayerDetail from "../../../../components/AdminPlayerDetail";

export default async function AdminPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <AdminPlayerDetail id={id} tab="overview" />
    </Suspense>
  );
}
