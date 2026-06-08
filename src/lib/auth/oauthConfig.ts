type OAuthEnv = Record<string, string | undefined>;

type OAuthCredentials = {
  clientId: string;
  clientSecret: string;
};

export type OAuthProviderStatus = {
  google: boolean;
  apple: boolean;
};

export type OAuthProviderCredentials = {
  google?: OAuthCredentials;
  apple?: OAuthCredentials;
};

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

export function getOAuthProviderCredentials(env: OAuthEnv = process.env): OAuthProviderCredentials {
  const googleClientId = clean(env.GOOGLE_CLIENT_ID);
  const googleClientSecret = clean(env.GOOGLE_CLIENT_SECRET);
  const appleClientId = clean(env.APPLE_CLIENT_ID);
  const appleClientSecret = clean(env.APPLE_CLIENT_SECRET);

  return {
    ...(googleClientId && googleClientSecret
      ? { google: { clientId: googleClientId, clientSecret: googleClientSecret } }
      : {}),
    ...(appleClientId && appleClientSecret
      ? { apple: { clientId: appleClientId, clientSecret: appleClientSecret } }
      : {}),
  };
}

export function getOAuthProviderStatus(env: OAuthEnv = process.env): OAuthProviderStatus {
  const credentials = getOAuthProviderCredentials(env);
  return {
    google: Boolean(credentials.google),
    apple: Boolean(credentials.apple),
  };
}
