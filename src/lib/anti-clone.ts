/**
 * Anti-clone guard (Nov 2026) — PER-SESSION ONLY.
 *
 * Chuks's order: any attempt to clone the site crashes automatically —
 * but ONLY that visitor's session crashes. Nothing site-wide, nothing
 * server-side, no API change.
 *
 * How it works:
 *  - The site only runs on an allowlisted hostname. Every other
 *    hostname is a clone: the page dies in that visitor's browser tab
 *    (session marker cleared, page blanked). The live site and every
 *    other user are never affected — there is no shared state at all.
 *  - Two layers: (1) an early inline script in the root layout
 *    (ANTI_CLONE_EARLY_SCRIPT, a raw <script> as the FIRST child of
 *    <body>) that runs DURING parsing, before any of the app HTML is
 *    parsed — so a clone shows a dead page, never a flash of the real
 *    site. NOTE: next/script beforeInteractive does NOT do this in
 *    App Router — the script only exists inside the streamed RSC
 *    flight data and executes after hydration, i.e. after the app
 *    has rendered. The raw script tag is the only way to run before
 *    the app renders. (2) AntiCloneGuard, a client component that
 *    re-checks on mount, every 30s, and whenever the tab becomes
 *    visible again, so a host change mid-session still kills it.
 *  - The allowlist is EXACT hostname equality only — no substring
 *    matching. `royale-omega.vercel.app.evil.com`,
 *    `evilroyale-omega.vercel.app` and `sub.royale-omega.vercel.app`
 *    all die. `localhost` / `127.0.0.1` are allowed on any port for
 *    dev/testing. That means other Vercel preview links die too —
 *    that is the point, per Chuks's pick (15 Nov 2026).
 *
 * Honest limit: this is client-side. A dev who reads the code can
 * delete the check. It stops copy-paste clones, nothing more. It does
 * not phone home, does not loop, does not burn CPU, and never shows
 * an alert.
 *
 * The `rg_session` cookie is httpOnly, so JS cannot delete it — but
 * nothing in the app calls /api/auth/me without the `rg-session`
 * localStorage flag, so removing the flag kills the session
 * client-side. On a wrong host the real cookie would not even be sent
 * (cookies are origin-scoped), so the flag removal is the kill.
 */

export const ANTI_CLONE_ALLOWED_HOSTS = [
  "royale-omega.vercel.app",
  "royalegolld.com",
  "www.royalegolld.com",
  "localhost",
  "127.0.0.1",
] as const;

/** Exact hostname equality only — no suffix/prefix/substring match. */
export function isAllowedHost(hostname: string): boolean {
  // location.hostname is always lower-case and port-free; normalise
  // anyway so a direct call with "LOCALHOST" behaves the same.
  const host = hostname.trim().toLowerCase();
  return (ANTI_CLONE_ALLOWED_HOSTS as readonly string[]).includes(host);
}

/**
 * Kill this visitor's session in this tab only. Clears the session
 * marker, stops further loading, and blanks the page. Returns true
 * when it ran (always, in a browser). Sets window.__rgCloneKilled so
 * tests can prove the guard fired.
 */
export function killClonedSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.removeItem("rg-session");
  } catch {
    /* storage unavailable — the page wipe below still kills the clone */
  }
  (window as unknown as { __rgCloneKilled?: boolean }).__rgCloneKilled = true;
  try {
    window.stop();
  } catch {
    /* ignore */
  }
  // document.open() is a NO-OP while the parser is running (the spec
  // ignores open() when a script is executing during parsing), so the
  // wipe uses innerHTML instead — stop() first so the parser cannot
  // re-add content afterwards. After this the document is an empty
  // <html> shell: blank, no app, nothing to resurrect it from. (Async
  // head scripts may still execute in the background, but with the
  // flight data and the DOM root gone they cannot render anything.)
  try {
    document.documentElement.innerHTML = "";
  } catch {
    /* ignore */
  }
  return true;
}

/**
 * The early inline script, built from the same allowlist so the list
 * lives in exactly one place. Self-contained plain JS (no imports) —
 * rendered as a raw <script> first in <body> (see layout.tsx).
 * Must never contain the string "</script>".
 */
export const ANTI_CLONE_EARLY_SCRIPT = `(function(){try{var h=window.location.hostname;if(${JSON.stringify(ANTI_CLONE_ALLOWED_HOSTS)}.indexOf(h)!==-1)return;try{window.localStorage.removeItem("rg-session")}catch(e){}window.__rgCloneKilled=true;try{window.stop()}catch(e){}try{document.documentElement.innerHTML=""}catch(e){}}catch(e){}})();`;
