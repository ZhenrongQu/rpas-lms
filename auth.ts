import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "./src/lib/db";
import { verifyPassword } from "./src/lib/auth/password";

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
        const ok = await verifyPassword(password, user.hashedPassword);
        if (!ok) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
          accessTier: user.accessTier,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
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
