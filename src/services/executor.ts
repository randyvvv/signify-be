import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "../db/schema.js";

/** Tipe koneksi drizzle (postgres-js) dengan skema kita. */
export type Database = PostgresJsDatabase<typeof schema>;

/** Objek transaksi yang diberikan oleh db.transaction(async (tx) => ...). */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Executor = bisa `db` langsung atau `tx` di dalam transaksi.
 * Service menerima ini supaya bisa dipakai sendiri atau dirangkai dalam
 * satu transaksi bersama operasi lain.
 */
export type Executor = Database | Transaction;
