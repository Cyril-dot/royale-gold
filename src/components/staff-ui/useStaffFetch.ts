// useStaffFetch — the one client-fetch pattern for staff pages (Phase 5).
// Moved here from components/owner/useOwnerFetch.ts (Phase 3) so admin
// pages use the same hook without importing from the owner tree — the
// owner file now re-exports this. The fetch runs in an effect, but
// setState happens ONLY inside the async .then/.catch callback (with a
// cancellation flag) — that is the shape eslint's
// react-hooks/set-state-in-effect accepts. When the URL changes only
// the tracked URL updates during render (the supported "adjusting state
// during render" pattern) — the previous rows stay visible until the
// new fetch lands (stale-while-revalidate, exactly the old behaviour).
// `url` null = don't fetch (gated loads). reload() re-runs the fetch
// and refreshes in place — used after actions.
"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";

export interface StaffFetchResult<T> {
  data: T | null;
  err: string | null;
  loading: boolean;
  reload: () => void;
}

export function useStaffFetch<T>(url: string | null): StaffFetchResult<T> {
  const [entry, setEntry] = useState<{ url: string | null; data: T | null; err: string | null }>({
    url,
    data: null,
    err: null,
  });
  const [nonce, setNonce] = useState(0);
  // URL changed since the last fetch: track it during render (the
  // supported "adjusting state during render" pattern — never in an
  // effect). The previous rows stay visible until the new fetch lands
  // (stale-while-revalidate, exactly the old behaviour) — blanking the
  // list on every keystroke of a search box would be worse. The
  // .then/.catch below drops results whose URL is no longer current.
  if (entry.url !== url) {
    setEntry((prev) => ({ ...prev, url }));
  }
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  useEffect(() => {
    if (url === null) return;
    let cancelled = false;
    api<T>(url)
      .then((data) => {
        if (!cancelled) setEntry((prev) => (prev.url === url ? { url, data, err: null } : prev));
      })
      .catch((ex) => {
        if (!cancelled) {
          setEntry((prev) =>
            prev.url === url
              ? { url, data: null, err: ex instanceof Error ? ex.message : "Could not load." }
              : prev,
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url, nonce]);
  return {
    data: entry.data,
    err: entry.err,
    loading: url !== null && entry.data === null && entry.err === null,
    reload,
  };
}
