import { createHmac, timingSafeEqual } from "node:crypto";
import { SignJWT, importPKCS8 } from "jose";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export interface StreamConfig {
  accountId: string;
  apiToken: string;
  customerCode: string;
  signingKeyId: string;
  signingKeyPem: string;
  webhookSecret: string;
}

/** Reads Cloudflare Stream config from env; base64-decodes the signing key PEM. */
export function streamConfig(): StreamConfig {
  return {
    accountId: required("CF_ACCOUNT_ID"),
    apiToken: required("CF_STREAM_API_TOKEN"),
    customerCode: required("CF_STREAM_CUSTOMER_CODE"),
    signingKeyId: required("CF_STREAM_SIGNING_KEY_ID"),
    signingKeyPem: Buffer.from(required("CF_STREAM_SIGNING_KEY_PEM"), "base64").toString("utf8"),
    webhookSecret: required("CF_STREAM_WEBHOOK_SECRET"),
  };
}

/** Verifies a Cloudflare Stream webhook signature header (`time=…,sig1=…`). */
export function verifyWebhookSignature(opts: {
  body: string;
  signatureHeader: string;
  secret: string;
  toleranceSec?: number;
  now?: number;
}): boolean {
  const parts = Object.fromEntries(
    opts.signatureHeader.split(",").map((kv) => kv.split("=") as [string, string]),
  );
  const time = Number(parts.time);
  const sig1 = parts.sig1;
  if (!Number.isFinite(time) || !sig1) return false;

  const tolerance = opts.toleranceSec ?? 300;
  const nowSec = Math.floor((opts.now ?? Date.now()) / 1000);
  if (Math.abs(nowSec - time) > tolerance) return false;

  const expected = createHmac("sha256", opts.secret).update(`${time}.${opts.body}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(sig1);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Signs a short-lived RS256 playback token for a Cloudflare Stream signed-URL video. */
export async function signPlaybackToken(opts: {
  videoUid: string;
  keyId: string;
  privateKeyPem: string;
  expiresInSec?: number;
}): Promise<string> {
  const key = await importPKCS8(opts.privateKeyPem, "RS256");
  const ttl = opts.expiresInSec ?? 6 * 60 * 60;
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: opts.keyId })
    .setSubject(opts.videoUid)
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(key);
}
