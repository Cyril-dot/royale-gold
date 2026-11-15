// Anti-clone background guard — second layer behind the early inline
// script in the root layout. Re-checks the hostname on mount, every
// 30s, and whenever the tab becomes visible again, so a host change
// mid-session still kills this visitor's session only. Renders nothing.
"use client";

import { useEffect } from "react";
import { isAllowedHost, killClonedSession } from "../lib/anti-clone";

const RECHECK_MS = 30_000;

export default function AntiCloneGuard() {
  useEffect(() => {
    const check = () => {
      if (!isAllowedHost(window.location.hostname)) killClonedSession();
    };
    check();
    const id = window.setInterval(check, RECHECK_MS);
    const onVisible = () => {
      if (!document.hidden) check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}
