// Phase 2 PayTeller (Nov 2026): the hosted-checkout return page.
// Reads ?ref= and polls GET /api/wallet/payteller/status every 10 s
// for up to 5 minutes. Shows pending / success / failed states.
//
// The return is NOT proof: coming back here means nothing on its own
// — the wallet only changes when the status call says "successful"
// (the webhook is the other path that can settle it). The page says so
// plainly, in every state.
//
// Nov 2026: no "Go to wallet" button any more — once the payment
// reaches a terminal state the wallet opens on its own
// (router.replace, so back never loops here).
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, fmtMoney } from "../../../../lib/api";
import { useStore } from "../../../../lib/store";

type Status =
  | "checking"
  | "pending"
  | "processing"
  | "successful"
  | "failed"
  | "expired"
  | "timeout"
  | "signin"
  | "error";

const POLL_MS = 10_000;
const MAX_POLLS = 30; // 30 × 10 s = 5 minutes, like BetWins.

export default function ReturnClient() {
  const params = useSearchParams();
  const router = useRouter();
  const ref = params.get("ref") ?? "";
  const { refresh, openAuth } = useStore();
  const [status, setStatus] = useState<Status>("checking");
  const [amount, setAmount] = useState<number | null>(null);
  const polls = useRef(0);

  useEffect(() => {
    if (!ref) {
      setStatus("error");
      return;
    }
    let live = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const poll = async () => {
      polls.current += 1;
      try {
        const r = await api<{ status: string; credited: boolean; amount: number }>(
          `/api/wallet/payteller/status?reference=${encodeURIComponent(ref)}`,
        );
        if (!live) return;
        setAmount(typeof r.amount === "number" ? r.amount : null);
        if (r.status === "successful") {
          setStatus("successful");
          stop();
          if (r.credited) void refresh();
        } else if (r.status === "failed") {
          setStatus("failed");
          stop();
        } else if (r.status === "expired") {
          setStatus("expired");
          stop();
        } else {
          setStatus(r.status === "processing" ? "processing" : "pending");
        }
      } catch (ex) {
        if (!live) return;
        // A 401 means the session is gone — stop and ask them to sign in.
        // Any other poll failure is transient: keep polling to the cap.
        if (ex instanceof Error && /not signed in/i.test(ex.message)) {
          setStatus("signin");
          stop();
          return;
        }
      }
      if (polls.current >= MAX_POLLS) {
        if (live) setStatus("timeout");
        stop();
      }
    };
    void poll();
    timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      live = false;
      stop();
    };
  }, [ref, refresh]);

  // Terminal states — the poll has stopped and the result will not
  // flip any more. Checking / pending / processing are NOT terminal:
  // the poll is still running and the payment can still succeed.
  const isTerminal =
    status === "successful" ||
    status === "failed" ||
    status === "expired" ||
    status === "timeout";

  // Auto-redirect (Nov 2026): no button — the wallet opens on its own
  // once the result is known. router.replace() so the back button
  // never loops back to this page. 2.5 s so the player actually
  // reads the result first.
  const REDIRECT_MS = 2500;
  useEffect(() => {
    if (!isTerminal) return;
    const t = setTimeout(() => router.replace("/wallet"), REDIRECT_MS);
    return () => clearTimeout(t);
  }, [isTerminal, router]);

  const headline =
    status === "successful"
      ? "Payment confirmed"
      : status === "failed"
        ? "Payment did not complete"
        : status === "expired"
          ? "This checkout expired"
          : status === "timeout"
            ? "Still confirming…"
            : status === "signin"
              ? "Sign in to check this payment"
              : status === "error"
                ? "No payment to check"
                : "Checking your payment…";

  const body =
    status === "successful"
      ? "Your wallet has been credited. You can play right away."
      : status === "failed"
        ? "PayTeller says this payment did not complete. Your wallet was not credited — try the deposit again."
        : status === "expired"
          ? "The PayTeller checkout timed out before you paid. Start a new deposit from your wallet."
          : status === "timeout"
            ? "PayTeller has not confirmed yet. Your wallet updates automatically once it does."
            : status === "signin"
              ? "Your session ended before the payment could be checked."
              : status === "error"
                ? "This link has no payment reference on it."
                : "Waiting for PayTeller to confirm. Keep this page open — it updates on its own.";

  return (
    <div className="pt-return">
      <h2>Payment status</h2>
      <p className={`pt-status${status === "successful" ? " ok" : status === "failed" || status === "expired" ? " bad" : ""}`}>
        {headline}
        {amount != null && (status === "successful" || status === "pending" || status === "processing") && (
          <span className="pt-amt">{fmtMoney(amount, "GHS")}</span>
        )}
      </p>
      {status === "signin" ? (
        <button className="btn btn-gold" type="button" onClick={() => openAuth("login")}>
          Log in
        </button>
      ) : isTerminal ? (
        <p className="pt-note">Taking you to your wallet…</p>
      ) : null}
      <p>{body}</p>
      <p className="pt-note">
        Coming back here doesn&apos;t mean the payment went through — your wallet only changes once
        PayTeller confirms it.
      </p>
    </div>
  );
}
