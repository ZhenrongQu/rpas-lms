import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string; accessTier?: "FREE" | "PAID"; role?: string } & DefaultSession["user"];
  }

  interface User {
    accessTier?: string;
    role?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    accessTier?: string;
    role?: string;
  }
}
