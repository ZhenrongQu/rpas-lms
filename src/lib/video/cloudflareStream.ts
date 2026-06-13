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
