// useOwnerFetch — re-exported from staff-ui (Phase 5). The hook itself
// moved to src/components/staff-ui/useStaffFetch.ts so admin pages use
// the same pattern without importing from the owner tree. One
// implementation; this file keeps the owner import path working.
"use client";

export { useStaffFetch as useOwnerFetch } from "../staff-ui/useStaffFetch";
export type { StaffFetchResult as OwnerFetchResult } from "../staff-ui/useStaffFetch";
