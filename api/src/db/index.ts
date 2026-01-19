import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { Context, Layer } from "every-plugin/effect";
import * as schema from "./schema";

export const createDatabase = (url: string, authToken?: string) => {
  const client = createClient({
    url,
    authToken,
  });

  return drizzle({ client, schema });
};

export type Database = ReturnType<typeof createDatabase>;

// Effect-TS Context Tag and Layer
export class DatabaseContext extends Context.Tag("Database")<DatabaseContext, Database>() {}

export const DatabaseLive = (url: string, authToken?: string) =>
  Layer.sync(DatabaseContext, () => createDatabase(url, authToken));
