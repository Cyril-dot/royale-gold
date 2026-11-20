// Admin promo card (Nov 2026) — the admin's shareable promo card:
// a polished square card (logo, headline, the admin's live promo code
// or the join offer) with Download PNG (1080×1080, html-to-image),
// Copy link, WhatsApp share and native share. Real data only — the
// code comes from the admin's own promo codes (GET /api/admin/promo-
// card); with no live code the card is the branded join card (5 free
// coins on signup is the real signup balance). The owner previews one
// admin with ?preview=, like every other admin page.
"use client";

import { Suspense, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toPng } from "html-to-image";
import { useStore } from "../../../lib/store";
import { useStaffFetch } from "../../../components/staff-ui/useStaffFetch";
import { PageHeader } from "../../../components/staff-ui/PageHeader";
import { Card } from "../../../components/staff-ui/Card";
import { Button } from "../../../components/staff-ui/Button";
import { CopyButton } from "../../../components/staff-ui/CopyButton";
import { FormField, Select } from "../../../components/staff-ui/Form";
import { Skeleton, ErrorState, EmptyState } from "../../../components/staff-ui/Feedback";

interface PromoCodeRow {
  id: string;
  code: string;
  bonusAmount: number;
  bonusCurrency: string;
  usesLeft: number;
  expiresAt: string | null;
}

interface PromoCardData {
  adminName: string;
  siteUrl: string;
  totalCodes: number;
  codes: PromoCodeRow[];
}

function fmtBonus(code: PromoCodeRow): string {
  const n = code.bonusAmount;
  const amount = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return code.bonusCurrency === "coins" ? `${amount} coins` : `GH₵${amount}`;
}

function fmtExpiry(iso: string | null): string {
  if (!iso) return "No expiry date";
  return `Expires ${new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

export default function AdminPromoPage() {
  return (
    <Suspense fallback={<Skeleton lines={6} title />}>
      <AdminPromoInner />
    </Suspense>
  );
}

function AdminPromoInner() {
  const { user, toast } = useStore();
  const router = useRouter();
  const sp = useSearchParams();
  const previewId = sp.get("preview");
  const url = useMemo(() => {
    if (!user) return null;
    return previewId
      ? `/api/admin/promo-card?adminId=${previewId}`
      : "/api/admin/promo-card";
  }, [user, previewId]);
  const { data, err, loading, reload } = useStaffFetch<PromoCardData>(url);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const codes = data?.codes ?? [];
  const picked = useMemo(() => {
    if (codes.length === 0) return null;
    return codes.find((c) => c.id === pickedId) ?? codes[0];
  }, [codes, pickedId]);

  const shareText = useMemo(() => {
    if (!data) return "";
    if (picked) {
      return (
        `Play & win real money on Royale Gold! Use code ${picked.code} ` +
        `for a ${fmtBonus(picked)} bonus. Join now: ${data.siteUrl}`
      );
    }
    return (
      `Play & win real money on Royale Gold! Join now and get 5 free ` +
      `coins. ${data.siteUrl}`
    );
  }, [data, picked]);

  const waUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  const downloadPng = async () => {
    const node = cardRef.current;
    if (!node || downloading) return;
    setDownloading(true);
    try {
      const width = node.offsetWidth || 400;
      const png = await toPng(node, { pixelRatio: 1080 / width, cacheBust: true });
      const a = document.createElement("a");
      a.href = png;
      a.download = picked ? `royale-gold-promo-${picked.code.toLowerCase()}.png` : "royale-gold-join.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast("Promo image downloaded — 1080 × 1080", "win");
    } catch {
      toast("Could not make the image — try again", "lose");
    } finally {
      setDownloading(false);
    }
  };

  const nativeShare = async () => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Royale Gold", text: shareText, url: data?.siteUrl });
        return;
      } catch {
        return; // user dismissed the sheet — nothing to do
      }
    }
    try {
      await navigator.clipboard.writeText(shareText);
      toast("Link copied — share it anywhere", "win");
    } catch {
      toast("Copy failed — long-press the text to copy it", "lose");
    }
  };

  return (
    <div>
      <PageHeader
        title="Promo card"
        sub="Your shareable Royale Gold card — download the image or share the link. Players join with your code."
      />
      {loading && !data ? <Skeleton lines={6} /> : null}
      {err ? <ErrorState text={err} onRetry={reload} /> : null}
      {data && codes.length === 0 ? (
        <EmptyState
          title="No live promo code yet"
          text="The card below is the join card — players still get 5 free coins on signup. Create a code on the Referrals page and it will appear here."
          actionLabel="Create a code"
          onAction={() => router.push("/admin/referrals")}
        />
      ) : null}
      {data ? (
        <div className="st-promo-wrap">
          {codes.length > 1 ? (
            <FormField label="Promo code on the card" htmlFor="stPromoPick">
              <Select
                id="stPromoPick"
                value={picked?.id ?? ""}
                onChange={(e) => setPickedId(e.target.value)}
              >
                {codes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {fmtBonus(c)} ({c.usesLeft} left)
                  </option>
                ))}
              </Select>
            </FormField>
          ) : null}

          {/* The card itself — this exact node becomes the PNG. Keep
              everything inside it self-contained: no buttons in here. */}
          <div className="st-promo-card" ref={cardRef}>
            <div className="st-promo-glow" aria-hidden="true" />
            <img className="st-promo-logo" src="/icon.png" alt="Royale Gold logo" />
            <p className="st-promo-brand">Royale Gold</p>
            <h2 className="st-promo-head">
              Play win
              <span>real money</span>
            </h2>
            <div className="st-promo-rule" aria-hidden="true" />
            {picked ? (
              <div className="st-promo-ticket">
                <p className="st-promo-ticket-label">Use code</p>
                <p className="st-promo-code">{picked.code}</p>
                <p className="st-promo-bonus">{fmtBonus(picked)} bonus</p>
                <p className="st-promo-meta">
                  {picked.usesLeft} {picked.usesLeft === 1 ? "use" : "uses"} left ·{" "}
                  {fmtExpiry(picked.expiresAt)}
                </p>
              </div>
            ) : (
              <div className="st-promo-ticket">
                <p className="st-promo-ticket-label">Join now</p>
                <p className="st-promo-code">5 free coins</p>
                <p className="st-promo-bonus">on signup — no deposit needed</p>
                <p className="st-promo-meta">New players start with 5 free coins</p>
              </div>
            )}
            <p className="st-promo-site">www.royalegolld.com</p>
            <p className="st-promo-cta">Play now</p>
          </div>

          <Card title="Share it" sub="The image and the link carry the same offer.">
            <div className="st-promo-actions">
              <Button variant="primary" onClick={() => void downloadPng()} disabled={downloading}>
                {downloading ? "Making image…" : "Download image"}
              </Button>
              <CopyButton text={shareText} label="Copy link" />
              <a className="st-btn st-btn-whatsapp" href={waUrl} target="_blank" rel="noreferrer">
                WhatsApp
              </a>
              <Button variant="ghost" onClick={() => void nativeShare()}>
                Share…
              </Button>
            </div>
            <p className="st-promo-sharetext">{shareText}</p>
            <p className="st-promo-hint">
              The image is 1080 × 1080 — made for WhatsApp and Instagram. Gmail free sends about
              500 emails a day; this card shares by link, not email, so there is no send limit.
            </p>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
