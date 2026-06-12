import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string; accessTier?: "FREE" | "PAID"; isAdmin?: boolean } & DefaultSession["user"];
  }

  interface User {
    accessTier?: string;
    isAdmin?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    accessTier?: string;
    isAdmin?: boolean;
  }
}
