// Owner staff layout — Phase 2: the AppShell lives here (grouped
// sidebar nav, phone bottom bar, owner guard, ⌘K palette) via
// OwnerShell. The legacy monolith at /owner/legacy renders bare inside
// it (no AppShell) so the old page stays pixel-identical until Phase 4
// deletes it. Tokens stay scoped under .staff.
import "../../components/staff-ui/tokens.css";
import { OwnerShell } from "../../components/owner/OwnerShell";

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="staff">
      <OwnerShell>{children}</OwnerShell>
    </div>
  );
}
