import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string; accessTier?: "FREE" | "PAID" } & DefaultSession["user"];
  }

  interface User {
    accessTier?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    accessTier?: string;
  }
}
