// Owner-guarded staff-only demo route (Phase 1, audit §11.4).
//
// NOTE: the audit suggested `/owner/_ui-demo`, but a leading underscore
// opts a folder OUT of routing in App Router, so the demo lives at
// `/owner/ui-demo` instead. Server-guarded with getSessionUser() —
// non-owners see a plain "owner only" state, never the components.
// Never linked from any player page. All data on it is labelled
// Demo/sample except the few LIVE figures, which are tagged LIVE.
import { getSessionUser } from "../../../lib/auth";
import StaffDemo from "./StaffDemo";
import { ErrorState } from "../../../components/staff-ui/Feedback";

// Owner-guarded: the session is read per request (cookies()), so this
// route cannot prerender. `next.config.ts` enables cacheComponents, which
// makes `dynamic = "force-dynamic"` a build error — the cacheComponents-era
// escape hatch is `instant = false` (disables Instant Navigation
// validation for this route; it renders at request time instead).
export const instant = false;

export default async function UiDemoPage() {
  const user = await getSessionUser();
  if (!user || user.role !== "owner") {
    return (
      <div>
        <ErrorState
          title="Owner only."
          text="This demo of the staff component library is visible to the owner account only. Log in as the owner to open it."
        />
      </div>
    );
  }
  return <StaffDemo ownerName={user.name} />;
}
