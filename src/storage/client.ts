import { PrismaClient } from "@prisma/client";

let client: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (!client) {
    client = new PrismaClient({ log: ["warn", "error"] });
    // Enable SQLite WAL mode for concurrent read/write performance (P1)
    client.$queryRawUnsafe("PRAGMA journal_mode=WAL").catch(() => {});
  }
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}

/**
 * Reset the Prisma client singleton, optionally with a new DATABASE_URL.
 * Used by vitest setup to give each worker an isolated database file,
 * preventing cross-worker FK race conditions.
 * Calling with no URL re-creates the client with the current env var value.
 */
export async function resetPrismaClient(databaseUrl?: string): Promise<PrismaClient> {
  await disconnectPrisma();
  if (databaseUrl !== undefined) {
    process.env.DATABASE_URL = databaseUrl;
  }
  return getPrismaClient();
}
