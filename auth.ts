import NextAuth from "next-auth";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { findOrCreateOAuthUser } from "./src/lib/auth/account";
import { authorizeLocalPasswordLogin } from "./src/lib/auth/localAccount";
import { getOAuthProviderCredentials } from "./src/lib/auth/oauthConfig";
import { prisma } from "./src/lib/db";
import { hasPaidAccess } from "./src/lib/payments/entitlements";

const oauthCredentials = getOAuthProviderCredentials();

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: {},
        phone: {},
        username: {},
        password: {},
      },
      async authorize(creds) {
        const email = typeof creds?.email === "string" ? creds.email : undefined;
        const phone = typeof creds?.phone === "string" ? creds.phone : undefined;
        const username = typeof creds?.username === "string" ? creds.username : undefined;
        const password = typeof creds?.password === "string" ? creds.password : undefined;
        const user = await authorizeLocalPasswordLogin({ email, phone, username, password });
        if (!user) return null;
        return {
          id: user.id,
          email: user.email ?? undefined,
          name: user.displayName ?? user.username ?? undefined,
          accessTier: user.accessTier,
        };
      },
    }),
    ...(oauthCredentials.google
      ? [
          Google({
            clientId: oauthCredentials.google.clientId,
            clientSecret: oauthCredentials.google.clientSecret,
          }),
        ]
      : []),
    ...(oauthCredentials.apple
      ? [
          Apple({
            clientId: oauthCredentials.apple.clientId,
            clientSecret: oauthCredentials.apple.clientSecret,
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user, account, profile, trigger }) {
      // On explicit session.update() call, re-derive accessTier from Entitlement (source of truth)
      // so payment takes effect immediately without sign-out.
      if (trigger === "update" && token.id) {
        const paid = await hasPaidAccess(token.id as string);
        token.accessTier = paid ? "PAID" : "FREE";
        return token;
      }

      if (account?.provider === "google" || account?.provider === "apple") {
        const email = typeof profile?.email === "string" ? profile.email : null;
        const emailVerified =
          account.provider === "apple"
            ? Boolean(email)
            : Boolean((profile as { email_verified?: boolean })?.email_verified);
        const displayName = typeof profile?.name === "string" ? profile.name : null;
        const localUser = await findOrCreateOAuthUser({
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          email,
          emailVerified,
          displayName,
        });
        token.id = localUser.id;
        token.accessTier = localUser.accessTier;
        return token;
      }

      if (user) token.id = (user as { id: string }).id;
      if (user) token.accessTier = (user as { accessTier?: string }).accessTier;
      return token;
    },
    session({ session, token }) {
      if (token.id && session.user) session.user.id = token.id as string;
      if (token.accessTier && session.user) {
        session.user.accessTier = token.accessTier as "FREE" | "PAID";
      }
      return session;
    },
  },
});
