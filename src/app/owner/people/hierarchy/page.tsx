// Owner Agent hierarchy (Phase 4 restyle) — split out of the old
// one-page owner panel (deleted in Phase 4). Same endpoint,
// same behaviour, staff-ui throughout: loads only its own data via
// useOwnerFetch, Skeleton / ErrorState / EmptyState, and one Card per
// top-level admin with their children listed. Read-only by design —
// the parent picker lives on the Admins page, not here.
"use client";

import { useStore } from "../../../../lib/store";
import { useOwnerFetch } from "../../../../components/owner/useOwnerFetch";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { Card } from "../../../../components/staff-ui/Card";
import { Badge } from "../../../../components/staff-ui/Badge";
import { Skeleton, EmptyState, ErrorState } from "../../../../components/staff-ui/Feedback";
import type { AdminRow } from "../../../../components/owner/owner-types";

export default function OwnerHierarchyPage() {
  const { user } = useStore();
  const { data, err, loading, reload } = useOwnerFetch<{ admins: AdminRow[] }>(
    user ? "/api/owner/admins" : null,
  );
  const admins = data?.admins ?? [];
  const roots = admins.filter((a) => !a.parentAdminId);
  return (
    <div>
      <PageHeader title="Agent hierarchy" sub="Who reports to whom." />
      <OwnerRangeBar />
      <Card title="Agent hierarchy" sub="Read-only — set or clear a parent on the Admins page.">
        {loading ? (
          <Skeleton lines={5} />
        ) : err ? (
          <ErrorState text={err} onRetry={reload} />
        ) : admins.length === 0 ? (
          <EmptyState title="No admins yet." text="Add the first admin on the Admins page." />
        ) : (
          <div>
            {roots.map((p) => {
              const kids = admins.filter((a) => a.parentAdminId === p.id);
              return (
                <div key={p.id}>
                  <div>
                    <b>{p.name}</b>{" "}
                    {kids.length === 0 ? (
                      <Badge variant="muted">No child admins</Badge>
                    ) : (
                      <Badge variant="info">
                        {kids.length} {kids.length === 1 ? "child admin" : "child admins"}
                      </Badge>
                    )}
                  </div>
                  {kids.length > 0 ? (
                    <p>
                      Children: {kids.map((k) => k.name).join(", ")} — their downlines roll into {p.name}
                      &apos;s Overview, Commission and Players pages.
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
