// Admin staff layout — Phase 5: the AppShell lives here (grouped
// sidebar nav, phone bottom bar, admin guard, ⌘K palette, owner preview
// banner) via AdminShell, mirroring the owner layout. Tokens stay scoped
// under .staff. The Suspense boundary covers AdminShell's
// useSearchParams (?preview=) — without it the build cannot prerender
// the layout.
import { Suspense } from "react";
import "../../components/staff-ui/tokens.css";
import { AdminShell } from "../../components/admin/AdminShell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="staff">
      <Suspense fallback={null}>
        <AdminShell>{children}</AdminShell>
      </Suspense>
    </div>
  );
}
