// Owner staff layout — Phase 2: the AppShell lives here (grouped
// sidebar nav, phone bottom bar, owner guard, ⌘K palette) via
// OwnerShell. Tokens stay scoped under .staff.
import "../../components/staff-ui/tokens.css";
import { OwnerShell } from "../../components/owner/OwnerShell";

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="staff">
      <OwnerShell>{children}</OwnerShell>
    </div>
  );
}
