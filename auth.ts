import NextAuth from "next-auth";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { createOrLoginVerifiedContactUser, findOrCreateOAuthUser } from "./src/lib/auth/account";
import { prisma } from "./src/lib/db";
import { verifyPassword } from "./src/lib/auth/password";
import { verifyCode } from "./src/lib/auth/verificationCode";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        const email = typeof creds?.email === "string" ? creds.email : "";
        const password = typeof creds?.password === "string" ? creds.password : "";
        if (!email || !password) return null;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;
        if (!user.hashedPassword) return null;
        const ok = await verifyPassword(password, user.hashedPassword);
        if (!ok) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.displayName ?? undefined,
          accessTier: user.accessTier,
        };
      },
    }),
    Credentials({
      id: "code",
      name: "Verification Code",
      credentials: {
        channel: {},
        target: {},
        code: {},
      },
      async authorize(creds) {
        const channel = creds?.channel === "sms" ? "sms" : "email";
        const target = typeof creds?.target === "string" ? creds.target : "";
        const code = typeof creds?.code === "string" ? creds.code : "";
        if (!target || !/^\d{6}$/.test(code)) return null;

        const verified = await verifyCode({ channel, target, code });
        if (!verified.ok) return null;

        const user = await createOrLoginVerifiedContactUser({
          channel,
          target: verified.target,
        });
        return {
          id: user.id,
          email: user.email ?? undefined,
          name: user.displayName ?? user.username ?? undefined,
          accessTier: user.accessTier,
        };
      },
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
    Apple({
      clientId: process.env.APPLE_CLIENT_ID ?? "",
      clientSecret: process.env.APPLE_CLIENT_SECRET ?? "",
    }),
  ],
  callbacks: {
    async jwt({ token, user, account, profile }) {
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
