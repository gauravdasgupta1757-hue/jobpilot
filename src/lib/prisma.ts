import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { pgSetup } from "@/lib/pg-config";

// Reuse one client across hot reloads in development instead of opening a new
// connection pool on every change.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function client(): PrismaClient {
  const { pool, schema } = pgSetup(env.DATABASE_URL);
  globalForPrisma.prisma ??= new PrismaClient({
    adapter: new PrismaPg(pool, { schema }),
  });
  return globalForPrisma.prisma;
}

/**
 * The shared database client. It's created on first use rather than on
 * import, so `next build`, which imports every page, works without the
 * secrets that reading `env` requires.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_, key) {
    const target = client();
    const value = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  },
});
