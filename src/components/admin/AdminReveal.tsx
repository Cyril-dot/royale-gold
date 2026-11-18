// Admin reveal helpers (Phase 5) — masked contacts + payout accounts
// for the admin panels. Every reveal calls POST /api/owner/reveal with
// an `admin-*` kind (admin-guarded, permission + downline scoped) and
// the endpoint writes the audit entry — these components never claim a
// log that wasn't made. In owner preview the Reveal control is hidden
// entirely (preview is read-only).
"use client";

import { useState } from "react";
import { api } from "../../lib/api";
import { Button } from "../staff-ui/Button";
import { MaskedValue } from "../staff-ui/MaskedValue";

/** A player's contact (email or phone), masked by default with an
 *  audited Reveal. `contact` is the display value from the list row;
 *  the reveal returns the same field unmasked. */
export function AdminContactValue({
  userId,
  contact,
  preview = false,
}: {
  userId: string;
  contact: string | null;
  preview?: boolean;
}) {
  if (!contact) return <span>—</span>;
  const isEmail = contact.includes("@");
  return (
    <MaskedValue
      value={contact}
      kind={isEmail ? "email" : "phone"}
      label="Player contact"
      hideReveal={preview}
      onReveal={
        preview
          ? undefined
          : async () => {
              const r = await api<{ value: { email: string | null; phone: string | null } }>("/api/owner/reveal", {
                method: "POST",
                body: JSON.stringify({ kind: "admin-user-contact", id: userId }),
              });
              return isEmail ? r.value.email : r.value.phone;
            }
      }
    />
  );
}

/** The payout account saved on a withdrawal — hidden until the admin
 *  taps Reveal, which calls the audited reveal endpoint once. The
 *  endpoint (not this component) writes the audit entry. Mirrors the
 *  owner withdrawals page's version, with the admin-guarded kind. */
export function AdminWithdrawalAccountReveal({
  withdrawalId,
  preview = false,
}: {
  withdrawalId: string;
  preview?: boolean;
}) {
  const [acct, setAcct] = useState<{ accountType: string | null; accountName: string | null; accountDetail: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (preview) return <span>Account hidden in preview.</span>;
  const reveal = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ value: { accountType: string | null; accountName: string | null; accountDetail: string | null } }>(
        "/api/owner/reveal",
        { method: "POST", body: JSON.stringify({ kind: "admin-withdrawal-account", id: withdrawalId }) },
      );
      setAcct(r.value);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Reveal failed.");
    } finally {
      setBusy(false);
    }
  };
  if (err) return <span role="alert">{err}</span>;
  if (!acct) {
    return (
      <Button variant="ghost" size="sm" loading={busy} onClick={() => void reveal()}>
        Reveal account
      </Button>
    );
  }
  if (!acct.accountType && !acct.accountName && !acct.accountDetail) {
    return <span>No account details saved on this withdrawal.</span>;
  }
  return (
    <span>
      {acct.accountType ? <span>{acct.accountType}</span> : null}
      {acct.accountName ? <span> · {acct.accountName}</span> : null}
      {acct.accountDetail ? (
        <span>
          {" · "}
          <MaskedValue value={acct.accountDetail} kind="account" label="Payout account" revealedValue={acct.accountDetail} onHide={() => setAcct(null)} />
        </span>
      ) : null}
    </span>
  );
}
