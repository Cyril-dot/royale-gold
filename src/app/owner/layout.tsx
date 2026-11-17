// Owner staff layout — Phase 1 foundation only.
// Imports tokens.css (scoped under .staff — see tokens.css header) and
// wraps the section in the .staff scope. Deliberately NO AppShell nav
// here yet: the existing owner page still renders its own strip + pill
// tabs, and adding the shell now would double the navigation. AppShell
// lands per-route in Phase 2 when the monolith splits; the demo route
// shows it live.
import "../../components/staff-ui/tokens.css";

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return <div className="staff">{children}</div>;
}
