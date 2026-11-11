import type { Metadata } from "next";
import { Anton, Outfit } from "next/font/google";
import "./globals.css";
import "./v48.css";
import { StoreProvider } from "../lib/store";
import Header from "../components/Header";
import AuthModal from "../components/AuthModal";
import DepositModal from "../components/DepositModal";
import Toasts from "../components/Toasts";

const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-display" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Royale Gold",
  description: "Royale Gold — 31 games. Cash in GH₵, coins for play.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${anton.variable} ${outfit.variable}`}>
      <body>
        <StoreProvider>
          <Header />
          <Toasts />
          {children}
          <AuthModal />
          <DepositModal />
        </StoreProvider>
      </body>
    </html>
  );
}
