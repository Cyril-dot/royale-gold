// Owner Agent hierarchy (Phase 2) — split out of the old one-page owner panel
// (src/app/owner/legacy/page.tsx). Same sections, same endpoints, same
// behaviour — now its own route, loading only its own data.
"use client";

import { useEffect } from "react";
import { useStore } from "../../../../lib/store";
import { useOwner } from "../../../../components/owner/OwnerContext";
import { OwnerRangeBar } from "../../../../components/owner/OwnerRangeBar";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";

export default function OwnerHierarchyPage() {
  const { user } = useStore();
  const { admins: ctxAdmins, loadAdmins } = useOwner();
  const admins = ctxAdmins ?? [];
  useEffect(() => { if (user) void loadAdmins(); }, [loadAdmins, user]);
  return (
    <div>
      <PageHeader title="Agent hierarchy" sub="Who reports to whom." />
      <OwnerRangeBar />
      <section className="admin-sec">
      <h3>Agent hierarchy</h3>
      {admins.length === 0 ? <p>No admins yet.</p> : (
        <div className="ow-games">
          {admins.filter((a) => !a.parentAdminId).map((p) => {
            const kids = admins.filter((a) => a.parentAdminId === p.id);
            return (
              <div key={p.id} className="ow-game-row">
                <div className="ow-game-head">
                  <b>{p.name}</b>
                  <span className="ow-game-cur">{kids.length === 0 ? "No child admins" : `${kids.length} ${kids.length === 1 ? "child admin" : "child admins"}`}</span>
                </div>
                {kids.length > 0 && (
                  <p className="ow-game-note">Children: {kids.map((k) => k.name).join(", ")} — their downlines roll into {p.name}&apos;s Overview, Commission and Players pages.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
      </section>
    </div>
  );
}
