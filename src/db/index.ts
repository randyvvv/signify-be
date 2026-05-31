import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../lib/env.js";
import * as schema from "./schema.js";

// prepare: false direkomendasikan saat memakai Supabase connection pooler (pgbouncer).
const client = postgres(env.DATABASE_URL, { prepare: false });

export const db = drizzle(client, { schema });
export { schema };
