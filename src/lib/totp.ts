// P0 Batch 3 (A13): TOTP two-factor auth (opt-in per admin/owner).
//
// otplib v13 is ESM-only and its functional API is ASYNC: generate and
// verify return Promises, and verify resolves to { valid, delta, ... }
// (not a plain boolean). generateURI is sync. QR codes come from the
// `qrcode` package (toDataURL, PNG data URL — no new service).

import { generateSecret, generate, verify, generateURI } from "otplib";
import QRCode from "qrcode";

const ISSUER = "Royale Gold";

/** New base32 secret for a 2FA setup (32 chars). */
export function newTotpSecret(): string {
  return generateSecret();
}

/** The otpauth:// URI an authenticator app scans (also the QR payload). */
export function totpUri(label: string, secret: string): string {
  return generateURI({ issuer: ISSUER, label, secret });
}

/** PNG data URL of the QR code for the otpauth URI. */
export async function totpQrDataUrl(label: string, secret: string): Promise<string> {
  return QRCode.toDataURL(totpUri(label, secret));
}

/** The current 6-digit code for a secret (used by rigs/tests, not login). */
export async function totpCode(secret: string): Promise<string> {
  return generate({ secret });
}

/** True when the code is valid for the secret right now (±1 step window). */
export async function verifyTotp(secret: string, token: string): Promise<boolean> {
  const clean = token.replace(/\D/g, "");
  if (clean.length !== 6) return false;
  try {
    const res = await verify({ token: clean, secret, epochTolerance: 30 });
    return res.valid === true;
  } catch {
    return false;
  }
}
