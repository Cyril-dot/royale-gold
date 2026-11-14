// Client-side session store: auth, wallet, REAL/SIM mode, mute, toasts.
// Balances always come from the API (/api/auth/me, /api/wallet, settle
// responses). SIM is the demo balance; coin/cash balances are server-side.
// localStorage holds ONLY preferences (mute, mode) — never money.

"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, User, Wallet } from "./api";
import { mutedStored, setMutedStored, sfx } from "./sound";

export type Mode = "REAL" | "SIM";
export type ToastKind = "win" | "lose" | "info";
export interface Toast {
  id: number;
  text: string;
  kind: ToastKind;
}

interface Store {
  user: User | null;
  wallet: Wallet | null;
  loading: boolean;
  mode: Mode;
  setMode: (m: Mode) => void;
  muted: boolean;
  toggleMute: () => void;
  toasts: Toast[];
  toast: (text: string, kind?: ToastKind) => void;
  refresh: () => Promise<void>;
  setWallet: (w: Wallet) => void;
  setUser: (u: User | null) => void;
  login: (emailOrPhone: string, password: string) => Promise<User>;
  register: (name: string, emailOrPhone: string, password: string, refCode?: string) => Promise<{ user: User; referredBonusCoins?: number }>;
  logout: () => Promise<void>;
  authOpen: boolean;
  authMode: "login" | "register";
  openAuth: (mode?: "login" | "register") => void;
  closeAuth: () => void;
  depositOpen: boolean;
  setDepositOpen: (v: boolean) => void;
  refPrefill: string;
  setRefPrefill: (v: string) => void;
  /** Session-scoped SIM balance (demo play only). Seeded from the server
   *  SIM wallet on load; SIM-mode cash games debit/credit this in-memory
   *  counter only — there is no SIM settle endpoint in the contract, and
   *  SIM must never touch the real cash wallet. */
  simSession: number | null;
  setSimSession: (v: number) => void;
  /** Instant demo credit: +GH₵ 1,000 SIM, client-side only. SIM is
   *  demo money by design — there is no SIM top-up endpoint, and a
   *  reload re-seeds the session counter from the server value. */
  topUpSim: () => void;
}

const Ctx = createContext<Store | null>(null);

let toastId = 0;

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [wallet, setWalletState] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setModeState] = useState<Mode>("REAL");
  const [muted, setMuted] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [depositOpen, setDepositOpen] = useState(false);
  const [refPrefill, setRefPrefill] = useState("");
  const [simSession, setSimSession] = useState<number | null>(null);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const toast = useCallback((text: string, kind: ToastKind = "info") => {
    const id = ++toastId;
    setToasts((t) => [...t, { id, text, kind }]);
    // v46/v47: show fully 2s, fade ~0.3s, gone. A new result replaces the old.
    const hide = setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
      timers.current.delete(id);
    }, 2300);
    timers.current.set(id, hide);
  }, []);

  const setWallet = useCallback((w: Wallet) => setWalletState({ cash: w.cash, coins: w.coins, sim: w.sim }), []);

  const refresh = useCallback(async () => {
    // Signed-out loads must not hit /api/auth/me or /api/wallet at all:
    // both 401 and the failed-resource noise that comes with them. The
    // session cookie is httpOnly (invisible to JS), so login/register set
    // a localStorage flag instead; logout and any 401 clear it. A stale
    // flag costs at most one 401, which self-heals by clearing the flag.
    const hasSession = typeof window !== "undefined" && window.localStorage.getItem("rg-session") === "1";
    if (!hasSession) {
      setUser(null);
      setWalletState(null);
      return;
    }
    try {
      const me = await api<{ user: User }>("/api/auth/me");
      setUser(me.user);
      setWalletState({ cash: me.user.cash, coins: me.user.coins, sim: me.user.sim });
      setSimSession((prev) => (prev === null ? me.user.sim : prev));
    } catch {
      setUser(null);
      setWalletState(null);
      try { window.localStorage.removeItem("rg-session"); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    setMuted(mutedStored());
    try {
      const m = localStorage.getItem("rg-mode");
      if (m === "SIM" || m === "REAL") setModeState(m);
    } catch {
      /* ignore */
    }
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem("rg-mode", m);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      setMutedStored(!m);
      return !m;
    });
  }, []);

  // Round 12: SIM top-up — instant demo credit, no server call. The
  // session counter is the live SIM balance; a reload re-seeds it from
  // the server value, which is fine for demo money.
  const topUpSim = useCallback(() => {
    setSimSession((prev) => (prev ?? wallet?.sim ?? 0) + 1000);
    toast("SIM topped up +GH₵ 1,000", "info");
  }, [wallet, toast]);

  const login = useCallback(async (emailOrPhone: string, password: string) => {
    const r = await api<{ user: User }>("/api/auth/login", { method: "POST", body: JSON.stringify({ emailOrPhone, password }) });
    try { window.localStorage.setItem("rg-session", "1"); } catch { /* ignore */ }
    setUser(r.user);
    setWalletState({ cash: r.user.cash, coins: r.user.coins, sim: r.user.sim });
    return r.user;
  }, []);

  const register = useCallback(async (name: string, emailOrPhone: string, password: string, refCode?: string) => {
    const r = await api<{ user: User; referredBonusCoins?: number }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, emailOrPhone, password, refCode: refCode || undefined }),
    });
    try { window.localStorage.setItem("rg-session", "1"); } catch { /* ignore */ }
    setUser(r.user);
    setWalletState({ cash: r.user.cash, coins: r.user.coins, sim: r.user.sim });
    return r;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    try { window.localStorage.removeItem("rg-session"); } catch { /* ignore */ }
    setUser(null);
    await refresh();
  }, [refresh]);

  const openAuth = useCallback((m: "login" | "register" = "login") => {
    setAuthMode(m);
    setAuthOpen(true);
  }, []);
  const closeAuth = useCallback(() => setAuthOpen(false), []);

  // Referral landing: a shared link (/?ref=CODE) opens the register
  // modal with the code already filled in, signed-out users only. The
  // old /register?ref= link 404s — there is no /register route — so
  // shared links use /?ref=CODE (see shareLink in lib/admin-client).
  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (ref) {
        setRefPrefill(ref.toUpperCase());
        if (window.localStorage.getItem("rg-session") !== "1") openAuth("register");
      }
    } catch {
      /* ignore */
    }
  }, [openAuth]);

  const value = useMemo<Store>(
    () => ({
      user, wallet, loading, mode, setMode, muted, toggleMute, toasts, toast,
      refresh, setWallet, setUser, login, register, logout,
      authOpen, authMode, openAuth, closeAuth, depositOpen, setDepositOpen,
      refPrefill, setRefPrefill, simSession, setSimSession, topUpSim,
    }),
    [user, wallet, loading, mode, setMode, muted, toggleMute, toasts, toast, refresh, login, register, logout, authOpen, authMode, openAuth, closeAuth, depositOpen, refPrefill, simSession, topUpSim]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}

export function playSfx(kind: "blip" | "flip" | "cheer" | "groan" | "tick" | "pop" | "boom", muted: boolean) {
  sfx[kind](muted);
}
