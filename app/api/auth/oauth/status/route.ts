import { getOAuthProviderStatus } from "../../../../../src/lib/auth/oauthConfig";
import { isNativeUA } from "../../../../../src/lib/platform";

export async function GET(request: Request): Promise<Response> {
  // Google blocks OAuth inside embedded WebViews, so the native (Capacitor) shell
  // can't complete third-party sign-in. Hide both providers there and let users
  // sign in with password / verification code instead.
  if (isNativeUA(request.headers.get("user-agent"))) {
    return Response.json({ providers: { google: false, apple: false } });
  }
  return Response.json({ providers: getOAuthProviderStatus() });
}
