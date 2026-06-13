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
