/**
 * Copyright 2026 熊高锐
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
