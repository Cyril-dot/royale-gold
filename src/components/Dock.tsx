// Mobile bottom nav — the v48 artifact's floating dock, restored.
// Mobile-only (v48.css shows it at ≤760px; fixed bottom centre with the
// safe-area inset). Links are the port's routes: Home (/), Games
// (/games), Promos (/#promos), Winners (/#winners). The centre chip
// spins the headline slot: on the homepage it fires an "rg:spin-slot"
// event the Hero listens for; elsewhere it navigates home first.
// NOTE: mounted from the homepage only — site-wide mounting needs one
// line in layout.tsx, which is out of bounds for this round.

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function Dock() {
  const pathname = usePathname();
  const router = useRouter();
  const play = () => {
    if (pathname === "/") {
      window.dispatchEvent(new CustomEvent("rg:spin-slot"));
    } else {
      router.push("/#top");
    }
  };
  return (
    <nav className="dock" aria-label="Quick navigation">
      <Link href="/#top" className={pathname === "/" ? "active" : ""}>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 3 2 12h3v9h6v-6h2v6h6v-9h3L12 3z" /></svg>
        Home
      </Link>
      <Link href="/games" className={pathname === "/games" ? "active" : ""}>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" /></svg>
        Games
      </Link>
      <button type="button" className="dock-play" onClick={play} aria-label="Play — spin the headline slot">
        <span>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19"><path fill="currentColor" d="M8 5v14l11-7z" /></svg>
        </span>
      </button>
      <Link href="/#promos">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="8" width="17" height="12.5" rx="1.5" /><path d="M12 8v12.5M3.5 12.5h17M12 8c-3.8 0-5.2-1.6-5.2-3.2C6.8 3.4 8.4 2.6 9.6 3.6 11 4.8 12 8 12 8zm0 0c3.8 0 5.2-1.6 5.2-3.2 0-1.4-1.6-2.2-2.8-1.2C13 4.8 12 8 12 8z" /></svg>
        Promos
      </Link>
      <Link href="/#winners">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M6 2h12v2h3v3a5 5 0 0 1-5 5h-.2A6 6 0 0 1 13 16.9V19h4v2H7v-2h4v-2.1A6 6 0 0 1 8.2 12H8a5 5 0 0 1-5-5V4h3V2zm-1 4v1a3 3 0 0 0 3 3V6H5zm14 0h-3v4a3 3 0 0 0 3-3V6z" /></svg>
        Winners
      </Link>
    </nav>
  );
}
