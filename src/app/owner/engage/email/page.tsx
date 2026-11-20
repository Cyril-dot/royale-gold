// Owner Email customers (Nov 2026) — the owner sends EMAIL to
// customers via the Gmail SMTP mailer (royalgolld@gmail.com). This is
// email, not the in-app Announcements / broadcast on the same Engage
// tab (those never leave the site). Three recipient modes: all
// customers, chosen customers, or any typed email address. One send
// covers at most 100 people; Gmail free sends about 500 a day.
"use client";

import { useMemo, useState } from "react";
import { api } from "../../../../lib/api";
import { useStore } from "../../../../lib/store";
import { PageHeader } from "../../../../components/staff-ui/PageHeader";
import { Card } from "../../../../components/staff-ui/Card";
import { Button } from "../../../../components/staff-ui/Button";
import { FormField, Input, Select } from "../../../../components/staff-ui/Form";
import { useOwnerFetch } from "../../../../components/owner/useOwnerFetch";

interface CustomerRow {
  id: string;
  name: string;
  email: string | null;
}

interface SendResult {
  sent: number;
  failed: string[];
  total: number;
  totalMatching: number;
  capped: boolean;
}

type Mode = "all" | "selected" | "any";

export default function OwnerEmailPage() {
  const { user, toast } = useStore();
  const url = user ? "/api/owner/email/customers" : null;
  const { data, err, loading, reload } = useOwnerFetch<{ customers: CustomerRow[]; total: number; capped: boolean }>(url);
  const customers = useMemo(() => data?.customers ?? [], [data]);
  const total = data?.total ?? 0;

  const [mode, setMode] = useState<Mode>("all");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [anyEmail, setAnyEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => `${c.name} ${c.email ?? ""}`.toLowerCase().includes(q));
  }, [customers, search]);

  const togglePicked = (id: string) => {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const r = await api<SendResult>("/api/owner/email/send", {
        method: "POST",
        body: JSON.stringify({
          mode,
          subject: subject.trim(),
          message: message.trim(),
          userIds: mode === "selected" ? picked : undefined,
          email: mode === "any" ? anyEmail.trim() : undefined,
        }),
      });
      setResult(r);
      toast(`Email sent to ${r.sent} of ${r.total}`, r.failed.length > 0 ? "lose" : "win");
      if (r.failed.length === 0) {
        setSubject("");
        setMessage("");
        setPicked([]);
        setAnyEmail("");
      }
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Could not send email", "lose");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Email customers" sub="Send email to customers from royalgolld@gmail.com." />
      <Card title="New email" sub="One send covers at most 100 people. Gmail free sends about 500 emails a day. Every send is recorded in the audit log.">
        <form onSubmit={send}>
          <FormField label="Send to" required>
            <Select value={mode} onChange={(e) => setMode(e.target.value as Mode)} aria-label="Send to">
              <option value="all">All customers</option>
              <option value="selected">Choose customers</option>
              <option value="any">Any email address</option>
            </Select>
          </FormField>

          {mode === "all" ? (
            <p>
              {loading
                ? "Counting customers…"
                : `${total} customer${total === 1 ? "" : "s"} with an email on file.`}
              {total > 100 ? " Only the first 100 will get this one — send again for the rest." : ""}
            </p>
          ) : null}

          {mode === "selected" ? (
            <>
              <FormField label="Search customers">
                <Input
                  type="text"
                  placeholder="Search by name or email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </FormField>
              {loading ? (
                <p>Loading customers…</p>
              ) : err ? (
                <p>
                  Could not load customers. <button type="button" onClick={() => void reload()}>Retry</button>
                </p>
              ) : filtered.length === 0 ? (
                <p>No customers match.</p>
              ) : (
                <div className="st-checks" style={{ maxHeight: 264, overflowY: "auto" }}>
                  {filtered.map((c) => (
                    <label key={c.id} className="st-check">
                      <input
                        type="checkbox"
                        checked={picked.includes(c.id)}
                        onChange={() => togglePicked(c.id)}
                      />
                      <span>
                        {c.name} — {c.email}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <p>
                {picked.length} picked
                {picked.length > 100 ? " — only the first 100 will get this one." : "."}
              </p>
            </>
          ) : null}

          {mode === "any" ? (
            <FormField label="Email address" required>
              <Input
                type="email"
                placeholder="customer@example.com"
                value={anyEmail}
                onChange={(e) => setAnyEmail(e.target.value)}
                required
                maxLength={254}
              />
            </FormField>
          ) : null}

          <FormField label="Subject" required>
            <Input
              type="text"
              placeholder="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              minLength={1}
              maxLength={120}
            />
          </FormField>
          <FormField label="Message" required>
            <textarea
              className="st-textarea"
              placeholder="Write your message…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              minLength={1}
              maxLength={5000}
              rows={6}
            />
          </FormField>
          <Button
            variant="primary"
            type="submit"
            loading={busy}
            disabled={mode === "selected" && picked.length === 0}
          >
            Send email
          </Button>
        </form>
      </Card>

      {result ? (
        <Card title="Send result">
          <p>
            Sent to {result.sent} of {result.total}
            {result.capped ? ` (first 100 of ${result.totalMatching})` : ""}.
          </p>
          {result.failed.length > 0 ? (
            <>
              <p>These did not go through:</p>
              <ul>
                {result.failed.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </>
          ) : (
            <p>All delivered.</p>
          )}
        </Card>
      ) : null}
    </div>
  );
}
