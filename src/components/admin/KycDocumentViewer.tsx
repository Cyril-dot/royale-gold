// KycDocumentViewer — the KYC document viewer (Phase 5). Documents are
// player-pasted URLs, not uploads: the viewer renders the URL in-page
// where the host allows it, and ALWAYS offers a plain "Open document"
// link for hosts that block framing. The full URL is never printed as
// text (audit §3.5) — only the host is shown.
"use client";

export function KycDocumentViewer({
  documentUrl,
  documentTypeLabel,
  playerName,
}: {
  documentUrl: string;
  documentTypeLabel: string;
  playerName: string;
}) {
  let host = "";
  try {
    host = new URL(documentUrl).host;
  } catch {
    host = "";
  }
  return (
    <div className="st-doc-viewer">
      <div className="st-doc-viewer-bar">
        <b>{documentTypeLabel}</b>
        {host ? <span>hosted at {host}</span> : null}
        <a href={documentUrl} target="_blank" rel="noreferrer">
          Open document ↗
        </a>
      </div>
      <iframe src={documentUrl} title={`KYC document for ${playerName}`} />
      <div className="st-doc-viewer-bar">
        <span>Some hosts block in-page viewing — open the document directly if it stays blank.</span>
      </div>
    </div>
  );
}
