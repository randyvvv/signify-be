import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { env } from "../lib/env.js";

/**
 * Jalankan migrasi SQL di folder ./drizzle menggunakan migrator drizzle-orm.
 * Tidak melakukan introspeksi (beda dari `drizzle-kit push`), jadi aman dipakai
 * di runtime/deploy dan hanya butuh dependency produksi.
 *
 * Dev   : pnpm db:migrate:run
 * Deploy: node dist/db/migrate.js (lihat railway.json)
 */
const sql = postgres(env.DATABASE_URL, { max: 1 });
const db = drizzle(sql);

console.log("Running migrations...");
await migrate(db, { migrationsFolder: "./drizzle" });
console.log("Migrations done ✅");

await sql.end();
process.exit(0);
