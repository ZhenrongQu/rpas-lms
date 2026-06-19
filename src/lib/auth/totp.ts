import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// SEC-16: minimal RFC 6238 TOTP (HMAC-SHA1, 6 digits, 30s step) for admin MFA.
// Hand-rolled to avoid a new dependency; the defaults below are what Google
// Authenticator, Authy, 1Password, etc. assume, so any of them interoperates.

const STEP_SEC = 30;
const DIGITS = 6;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** New random base32 secret (160 bits, the RFC-recommended size). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** otpauth:// provisioning URI an authenticator app can import (also QR-able). */
export function totpAuthUri({ secret, account, issuer }: { secret: string; account: string; issuer: string }): string {
  // otpauth convention: label is "Issuer:account" with the parts percent-encoded
  // but the separating colon kept literal.
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SEC),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Current 6-digit code for a secret (used by enrollment confirmation flows/tests). */
export function generateTotp(secret: string, opts: { now?: number } = {}): string {
  const counter = Math.floor((opts.now ?? Date.now()) / 1000 / STEP_SEC);
  return hotp(base32Decode(secret), counter);
}

/** Verify a token against the secret, allowing ±`window` steps for clock skew. */
export function verifyTotp(secret: string, token: string, opts: { window?: number; now?: number } = {}): boolean {
  const cleaned = token.replace(/\D/g, "");
  if (cleaned.length !== DIGITS) return false;
  const window = opts.window ?? 1;
  const counter = Math.floor((opts.now ?? Date.now()) / 1000 / STEP_SEC);
  const key = base32Decode(secret);
  for (let i = -window; i <= window; i++) {
    if (constantTimeEqual(hotp(key, counter + i), cleaned)) return true;
  }
  return false;
}

function hotp(key: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const bin =
    ((hmac[offset]! & 0x7f) << 24) |
    (hmac[offset + 1]! << 16) |
    (hmac[offset + 2]! << 8) |
    hmac[offset + 3]!;
  return String(bin % 10 ** DIGITS).padStart(DIGITS, "0");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(secret: string): Buffer {
  const clean = secret.toUpperCase().replace(/=+$/, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
