/**
 * Database Client for Cloudflare D1
 *
 * Creates a Drizzle ORM client bound to the D1 database.
 * Unlike the original libsql client, D1 uses a binding from the Worker environment.
 */

import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDatabase>;

/**
 * Create a Drizzle database client for D1
 * @param d1 - The D1Database binding from Worker environment
 */
export function createDatabase(d1: D1Database) {
  return drizzle(d1, { schema });
}

export * from "./schema";
