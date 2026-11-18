import type { Metadata, Viewport } from "next";
import { Anton, Outfit } from "next/font/google";
import "./globals.css";
import "./v48.css";
import "./hdr-menu.css";
import "./cards-v5.css";
import "./bottle-v8.css";
import "./admin-ref.css";
import "./admin-v11.css";
import "./wallet-v11.css";
import "./wallet-v20.css";
import "./convert-v16.css";
import "./wallet-v31.css";
import "./games-v11.css";
import "./games-v17-arcade.css";
import "./games-v17-skill.css";
import "./games-v17-crash.css";
import "./games-v17-coin.css";
import "./games-v17-quick.css";
import "./games-v17-gamespage.css";
import "./games-v18.css";
import "./account-v27.css";
import "./admin-commission.css";
import "./admin-players.css";
import { StoreProvider } from "../lib/store";
import { ANTI_CLONE_EARLY_SCRIPT } from "../lib/anti-clone";
import AntiCloneGuard from "../components/AntiCloneGuard";
import StaffChrome from "../components/StaffChrome";
import Toasts from "../components/Toasts";

const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-display" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  // metadataBase makes og:image absolute (https://royale-omega.vercel.app/...)
  // — without it Next.js emits http://localhost:3000 and link previews break.
  metadataBase: new URL("https://royale-omega.vercel.app"),
  title: "Royale Gold",
  description: "Royale Gold — 46 games. Cash in GH₵, coins for play.",
  // PWA: the manifest route comes from app/manifest.ts; the icon routes
  // come from app/icon.png and app/apple-icon.png (Next 16 serves image
  // icons at /icon.png and /apple-icon.png — the extensionless paths
  // 404). The favicon link comes from the app/favicon.ico convention
  // itself, so it is not repeated here.
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.png", sizes: "512x512", type: "image/png" }],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Royale Gold",
    statusBarStyle: "black-translucent",
  },
};

// Mobile-native baseline (mobile-native skill §§7,10): viewport-fit=cover
// lets env(safe-area-inset-*) work so the felt header paints under the
// notch; theme-color matches the midnight top of the page. Never
// maximum-scale / user-scalable=no — zoom stays available.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#070812",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${anton.variable} ${outfit.variable}`}>
      <body>
        {/*
          Anti-clone guard (Nov 2026): a RAW inline <script> as the
          first child of <body> — it runs DURING parsing, before any
          of the app HTML is parsed, so a clone shows a dead page and
          never a flash of the real site. Do NOT replace this with
          next/script beforeInteractive: in App Router that script only
          exists inside the streamed RSC flight data and executes after
          hydration, i.e. after the app has rendered (verified 15 Nov
          2026 — the literal tag never appears in the initial HTML).
          Kills ONLY that visitor's session (clears the rg-session
          marker, blanks the page) on any hostname other than
          royale-omega.vercel.app / localhost / 127.0.0.1. A background
          re-check also runs in AntiCloneGuard below.
        */}
        <script dangerouslySetInnerHTML={{ __html: ANTI_CLONE_EARLY_SCRIPT }} />
        <StoreProvider>
          <AntiCloneGuard />
          <Toasts />
          {/* StaffChrome hides the player Header/Dock/AuthModal/DepositModal
              on /admin* and /owner* (audit §3.10). Player routes unchanged. */}
          <StaffChrome>{children}</StaffChrome>
        </StoreProvider>
      </body>
    </html>
  );
}
