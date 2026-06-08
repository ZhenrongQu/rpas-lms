import { getOAuthProviderStatus } from "../../../../../src/lib/auth/oauthConfig";

export async function GET(): Promise<Response> {
  return Response.json({ providers: getOAuthProviderStatus() });
}
