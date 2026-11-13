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
import "./convert-v16.css";
import "./games-v11.css";
import "./games-v17-arcade.css";
import "./games-v17-skill.css";
import "./games-v17-crash.css";
import "./games-v17-coin.css";
import "./games-v17-quick.css";
import { StoreProvider } from "../lib/store";
import Header from "../components/Header";
import Dock from "../components/Dock";
import AuthModal from "../components/AuthModal";
import DepositModal from "../components/DepositModal";
import Toasts from "../components/Toasts";

const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-display" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Royale Gold",
  description: "Royale Gold — 31 games. Cash in GH₵, coins for play.",
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
        <StoreProvider>
          <Header />
          <Toasts />
          {children}
          <Dock />
          <AuthModal />
          <DepositModal />
        </StoreProvider>
      </body>
    </html>
  );
}
