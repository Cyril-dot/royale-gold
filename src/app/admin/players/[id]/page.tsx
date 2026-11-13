// Admin dashboard — Player detail route (round 11). Server wrapper: the
// player id is a database id, so this route is dynamic — awaiting params
// here keeps Next from statically prerendering it (the layout's Dock
// usePathname() would block the prerender). The client detail lives in
// src/components/AdminPlayerDetail.tsx.
// instant = false: this route renders on demand (blocking), not as a
// prerendered static page — the id is only known at request time.

export const instant = false;

import { Suspense } from "react";
import AdminPlayerDetail from "../../../../components/AdminPlayerDetail";

export default async function AdminPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="rg48-page-main rg23">
      <div className="wrap">
        <Suspense fallback={null}>
          <AdminPlayerDetail id={id} />
        </Suspense>
      </div>
    </main>
  );
}
