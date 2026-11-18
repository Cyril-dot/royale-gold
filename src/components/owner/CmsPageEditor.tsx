// P2 Batch 2 (O30): one CMS page's editor — title + body + active
// toggle, saved to /api/owner/cms. An inactive page 404s on
// /pages/[slug]. Phase 4 restyle: staff-ui form controls; the "View
// public page" link keeps its target (the live player page).
import { useState } from "react";
import { api } from "../../lib/api";
import { useStore } from "../../lib/store";
import { Button } from "../staff-ui/Button";
import { FormField, Input } from "../staff-ui/Form";

export function CmsPageEditor({ page, onSaved }: {
  page: { slug: string; title: string; body: string; active: boolean };
  // The caller reloads its list after a save (useOwnerFetch's reload
  // returns void; the old loader returned a promise — both are fine).
  onSaved: () => void | Promise<void>;
}) {
  const { toast } = useStore();
  const [title, setTitle] = useState(page.title);
  const [body, setBody] = useState(page.body);
  const [active, setActive] = useState(page.active);
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/owner/cms", { method: "POST", body: JSON.stringify({ slug: page.slug, title: title.trim(), body: body.trim(), active }) });
      toast(`Page “${title.trim()}” saved`, "win");
      await onSaved();
    } catch (ex) {
      toast(ex instanceof Error ? ex.message : "CMS save failed", "lose");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save}>
      <FormField label="Title" required>
        <Input type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} aria-label={`Title for the ${page.slug} page`} required />
      </FormField>
      <FormField label="Body" required>
        <textarea
          className="st-textarea"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          maxLength={20000}
          aria-label={`Body for the ${page.slug} page`}
          required
        />
      </FormField>
      <p>
        <label style={{ display: "block", minHeight: 44 }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active — shows on
          /pages/{page.slug}
        </label>
      </p>
      <p>
        <Button variant="primary" type="submit" loading={busy}>
          Save page
        </Button>{" "}
        <a className="st-btn st-btn-ghost" href={`/pages/${page.slug}`} target="_blank" rel="noreferrer">
          View public page ↗
        </a>
      </p>
    </form>
  );
}
