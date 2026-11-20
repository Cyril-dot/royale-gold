// Phase 2 PayTeller (Nov 2026): the hosted-checkout return page.
// Server wrapper — the client poller reads ?ref= with useSearchParams,
// which needs a Suspense boundary in App Router.
import { Suspense } from "react";
import ReturnClient from "./ReturnClient";

export default function PaytellerReturnPage() {
  return (
    <main className="rg48-page-main pt-return-main">
      <div className="wrap">
        <Suspense fallback={<p>Loading…</p>}>
          <ReturnClient />
        </Suspense>
      </div>
    </main>
  );
}
