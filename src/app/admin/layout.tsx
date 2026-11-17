// Admin staff layout — Phase 1 foundation only.
// Imports tokens.css (scoped under .staff — see tokens.css header) and
// wraps the section in the .staff scope. Deliberately NO AppShell nav
// here yet: the 14 existing admin pages still render their own AdminNav,
// and adding the shell now would double the navigation. AppShell lands
// per-route in Phase 5 when pages migrate; the demo route shows it live.
import "../../components/staff-ui/tokens.css";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="staff">{children}</div>;
}
