import { PrismaClient } from "@prisma/client";

// Cache the client on globalThis so Next.js dev HMR and shared RSC/route-handler
// module instances don't open a new connection pool on every reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
