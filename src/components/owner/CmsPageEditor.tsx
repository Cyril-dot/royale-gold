import { useState } from "react";
import { api } from "../../lib/api";
import { useStore } from "../../lib/store";

// P2 Batch 2 (O30): one CMS page's editor — title + body + active
// toggle, saved to /api/owner/cms. An inactive page 404s on
// /pages/[slug].
export function CmsPageEditor({ page, onSaved }: {
  page: { slug: string; title: string; body: string; active: boolean };
  onSaved: () => Promise<void>;
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
    } finally { setBusy(false); }
  };
  return (
    <form className="owner-add" onSubmit={save}>
      <div className="pd-adjust-row">
        <label>Title
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} aria-label={`Title for the ${page.slug} page`} />
        </label>
        <label>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active — shows on /pages/{page.slug}
        </label>
      </div>
      <div className="pd-adjust-row">
        <label>Body
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={20000} aria-label={`Body for the ${page.slug} page`} />
        </label>
      </div>
      <div className="pd-adjust-row">
        <button className="btn btn-gold" type="submit" disabled={busy}>{busy ? "Saving…" : "Save page"}</button>
        <a className="btn btn-ghost" href={`/pages/${page.slug}`} target="_blank" rel="noreferrer">View public page ↗</a>
      </div>
    </form>
  );
}
