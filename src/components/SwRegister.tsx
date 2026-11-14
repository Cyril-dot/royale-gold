"use client";

import { useEffect } from "react";

// Registers /sw.js once for the whole session. The module-level flag
// guards against StrictMode's double-effect and any re-mount registering
// twice; a second register() of the same script would be harmless anyway.
let registered = false;

export default function SwRegister() {
  useEffect(() => {
    if (registered) return;
    if (!("serviceWorker" in navigator)) return;
    // Service workers need a secure context: https, or localhost.
    if (
      window.location.protocol !== "https:" &&
      window.location.hostname !== "localhost" &&
      window.location.hostname !== "127.0.0.1"
    ) {
      return;
    }
    registered = true;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      registered = false;
    });
  }, []);
  return null;
}
