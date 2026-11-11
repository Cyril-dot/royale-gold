import Link from "next/link";

const LINKS = [
  { href: "/games", label: "Games" },
  { href: "/account", label: "Account" },
  { href: "/admin", label: "Admin" },
  { href: "/owner", label: "Owner" },
];

/**
 * STUB — the UI agent ports the real v48 homepage here.
 * Kept minimal and on-token so the scaffold builds and the API can be
 * exercised before the port lands.
 */
export default function Home() {
  return (
    <main className="min-h-screen bg-midnight px-6 py-10 text-cream">
      <p className="text-xs tracking-widest text-gold uppercase">Royale Gold · v48 scaffold</p>
      <h1 className="font-display mt-3 text-5xl text-gold">ROYALE GOLD</h1>
      <p className="mt-3 max-w-md text-cream/80">
        Full-stack scaffold: accounts, referrals, commission, 29 games, rewards.
        The real homepage UI is ported from the v48 artifact by the UI agent.
      </p>
      <nav className="mt-8 flex flex-wrap gap-3">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-full border border-gold/60 px-5 py-2 text-sm font-semibold text-gold hover:bg-gold hover:text-midnight"
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <p className="mt-10 text-sm text-cream/50">
        API contract: <code>API_CONTRACT.md</code> at the repo root.
      </p>
    </main>
  );
}
