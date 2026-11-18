// P2 Batch 2 (O29): the jackpot pay form — the owner searches a
// player by name/email/phone (the owner's global player search), picks
// one, gives a reason, and pays the whole pot as a bonus. The pot then
// resets to the seed amount.
//
// Phase 4 restyle: staff-ui form controls, search-result contacts
// masked with an audited Reveal (POST /api/owner/reveal, kind
// user-contact), and paying the pot goes through the shared
// ConfirmDialog (jackpot, pot, player, consequence). The reason input
// stays optional, exactly as the legacy form had it — the endpoint
// accepts { userId, reason }.
"use client";

import { useState } from "react";
import { api } from "../../lib/api";
import { useStore } from "../../lib/store";
import { Button } from "../staff-ui/Button";
import { FormField, Input } from "../staff-ui/Form";
import { ConfirmDialog } from "../staff-ui/Dialog";
import { MaskedValue } from "../staff-ui/MaskedValue";
import { fmtStaffMoney } from "../staff-ui/format";

interface PaySearchPlayer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export function JackpotPayForm({
  jackpot,
  busy,
  onPay,
}: {
  jackpot: { id: string; name: string; currentPot: number };
  busy: boolean;
  onPay: (jackpotId: string, userId: string, reason: string) => Promise<void>;
}) {
  const { toast } = useStore();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PaySearchPlayer[]>([]);
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [reason, setReason] = useState("");
  const [payConfirm, setPayConfirm] = useState(false);
  const search = async () => {
    if (q.trim().length < 2) {
      toast("Search needs at least 2 characters", "lose");
      return;
    }
    try {
      const r = await api<{ players: (PaySearchPlayer & { role: string })[] }>(
        `/api/owner/players/search?q=${encodeURIComponent(q.trim())}`,
      );
      setResults(r.players.filter((p) => p.role === "user"));
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "Search failed", "lose");
    }
  };
  const contactOf = (p: PaySearchPlayer) => p.email ?? p.phone ?? null;
  return (
    <div>
      {picked ? (
        <p>
          Pay to: <b>{picked.name}</b>{" "}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setPicked(null);
              setQ("");
              setResults([]);
            }}
          >
            Change
          </Button>
        </p>
      ) : (
        <>
          <FormField label="Player (name / email / phone)">
            <Input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void search();
                }
              }}
              placeholder="Search players"
              aria-label={`Search a player to pay the ${jackpot.name} jackpot to`}
              enterKeyHint="search"
            />
          </FormField>
          <Button variant="secondary" onClick={() => void search()}>
            Search
          </Button>
          {results.length > 0 ? (
            <div>
              {results.map((p) => {
                const contact = contactOf(p);
                return (
                  <p key={p.id}>
                    <b>{p.name}</b>{" "}
                    {contact ? (
                      <MaskedValue
                        value={contact}
                        kind={contact.includes("@") ? "email" : "phone"}
                        label="Player contact"
                        onReveal={async () => {
                          const r = await api<{ value: { email: string | null; phone: string | null } }>(
                            "/api/owner/reveal",
                            { method: "POST", body: JSON.stringify({ kind: "user-contact", id: p.id }) },
                          );
                          return contact.includes("@") ? r.value.email : r.value.phone;
                        }}
                      />
                    ) : null}{" "}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPicked({ id: p.id, name: p.name });
                        setResults([]);
                      }}
                    >
                      Pick
                    </Button>
                  </p>
                );
              })}
            </div>
          ) : null}
        </>
      )}
      <FormField label="Reason (optional)">
        <Input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
          placeholder="Why this player"
          aria-label={`Reason for paying the ${jackpot.name} jackpot`}
        />
      </FormField>
      <Button
        variant="primary"
        loading={busy}
        disabled={!picked || jackpot.currentPot <= 0}
        onClick={() => setPayConfirm(true)}
      >
        {`Pay ${fmtStaffMoney(jackpot.currentPot, "GHS")}`}
      </Button>

      <ConfirmDialog
        open={payConfirm}
        onClose={() => setPayConfirm(false)}
        onConfirm={() => {
          if (!picked) return;
          setPayConfirm(false);
          return onPay(jackpot.id, picked.id, reason.trim());
        }}
        title={`Pay ${jackpot.name}`}
        body="Pays the whole pot to this player as a bonus. The pot then resets to the seed amount."
        facts={
          picked
            ? [
                { label: "Jackpot", value: jackpot.name },
                { label: "Pot", value: fmtStaffMoney(jackpot.currentPot, "GHS") },
                { label: "Player", value: picked.name },
                ...(reason.trim() ? [{ label: "Reason", value: reason.trim() }] : []),
              ]
            : []
        }
        confirmLabel={`Pay ${fmtStaffMoney(jackpot.currentPot, "GHS")}`}
        busy={busy}
      />
    </div>
  );
}
