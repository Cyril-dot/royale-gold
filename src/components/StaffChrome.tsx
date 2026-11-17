// StaffChrome — suppresses the player chrome (Header, Dock, AuthModal,
// DepositModal) on staff routes (/admin*, /owner*). The audit found the
// root layout renders them on staff pages too (audit §3.10, §11.3).
// Player-site effect: none — staff paths only. The anti-clone script and
// Toasts stay outside this gate and render everywhere, as before.
"use client";

import { usePathname } from "next/navigation";
import Header from "./Header";
import Dock from "./Dock";
import AuthModal from "./AuthModal";
import DepositModal from "./DepositModal";

export default function StaffChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const isStaff =
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/owner" ||
    pathname.startsWith("/owner/");
  return (
    <>
      {!isStaff ? <Header /> : null}
      {children}
      {!isStaff ? (
        <>
          <Dock />
          <AuthModal />
          <DepositModal />
        </>
      ) : null}
    </>
  );
}
