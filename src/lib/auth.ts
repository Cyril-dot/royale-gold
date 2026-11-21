import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { prisma } from "./prisma";
import { AuthError } from "./errors";

// Re-exported so existing server code can keep importing it from here.
export { AuthError };

export const SESSION_COOKIE = "rg_session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days, seconds

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not set (see .env.example)");
  return new TextEncoder().encode(s);
}

export interface SessionPayload {
  userId: string;
  role: "owner" | "admin" | "user";
  /** Session version (User.sessionVersion) at issue time. A token whose
   * version is older than the user's current version was killed
   * (P0 Batch 3 O15: deactivate / "Kill all sessions") and is rejected. */
  sv?: number;
}

/** Issue a session token. sessionVersion is the user's current
 * User.sessionVersion — pass it so the token can be killed later. */
export async function createSession(
  userId: string,
  role: SessionPayload["role"],
  sessionVersion = 0,
): Promise<string> {
  return new SignJWT({ userId, role, sv: sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret());
}

/** Bump a user's session version — every existing JWT for them stops
 * working at once (their next request fails getSessionUser). Returns the
 * new version. Used by deactivation and "Kill all sessions". */
export async function killSessions(userId: string): Promise<number> {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });
  return updated.sessionVersion;
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  try {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.userId !== "string" || typeof payload.role !== "string") return null;
    return {
      userId: payload.userId,
      role: payload.role as SessionPayload["role"],
      sv: typeof payload.sv === "number" ? payload.sv : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Every scalar User column. The session-user fetch selects exactly
 * these, so auth reads a fixed shape. Keep this list in step with
 * the User model: tsc fails any caller that uses a field missing
 * here.
 */
export const SESSION_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  passwordHash: true,
  role: true,
  country: true,
  currency: true,
  cashBalance: true,
  simBalance: true,
  coins: true,
  commissionPct: true,
  active: true,
  blockedAt: true,
  blockedReason: true,
  permissions: true,
  sessionVersion: true,
  totpSecret: true,
  totpEnabled: true,
  referredByAdminId: true,
  parentAdminId: true,
  referralCodeUsed: true,
  xp: true,
  level: true,
  createdAt: true,
  birthday: true,
} as const;

/** Load the session user (or null). Inactive accounts cannot act, and a
 * token issued before the user's sessions were killed (P0 Batch 3 O15)
 * is rejected — the stored sessionVersion must match the token's. */
export async function getSessionUser() {
  const session = await getSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: SESSION_USER_SELECT,
  });
  if (!user || !user.active) return null;
  if ((session.sv ?? 0) !== user.sessionVersion) return null;
  return user;
}

export type Role = "owner" | "admin" | "user";

/** Require a logged-in user; throws a Response-friendly error object. */
export async function requireAuth() {
  const user = await getSessionUser();
  if (!user) throw new AuthError(401, "Not signed in");
  return user;
}

/** Require one of the given roles (owner implies nothing automatically — pass it explicitly). */
export async function requireRole(...roles: Role[]) {
  const user = await requireAuth();
  if (!roles.includes(user.role as Role)) throw new AuthError(403, "Forbidden for this role");
  return user;
}
