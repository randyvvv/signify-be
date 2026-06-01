import { and, eq, gte, sql } from "drizzle-orm";
import { users } from "../db/schema.js";
import { badRequest } from "../lib/errors.js";
import type { Executor } from "./executor.js";

/** Tambah coins ke user. Mengembalikan saldo terbaru. */
export async function addCoins(
  exec: Executor,
  userId: string,
  amount: number,
): Promise<number | undefined> {
  if (amount <= 0) return undefined;
  const [row] = await exec
    .update(users)
    .set({ coins: sql`${users.coins} + ${amount}`, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning({ coins: users.coins });
  return row?.coins;
}

/**
 * Potong coins secara atomik. Update hanya berhasil jika saldo cukup
 * (`coins >= amount`), jadi aman dari race condition / double-spend.
 * Melempar AppError(400) kalau saldo tidak cukup.
 */
export async function spendCoins(
  exec: Executor,
  userId: string,
  amount: number,
): Promise<number> {
  if (amount <= 0) {
    const [row] = await exec
      .select({ coins: users.coins })
      .from(users)
      .where(eq(users.id, userId));
    return row?.coins ?? 0;
  }

  const rows = await exec
    .update(users)
    .set({ coins: sql`${users.coins} - ${amount}`, updatedAt: new Date() })
    .where(and(eq(users.id, userId), gte(users.coins, amount)))
    .returning({ coins: users.coins });

  if (rows.length === 0) {
    throw badRequest("Coins tidak cukup", "insufficient_coins");
  }
  return rows[0]!.coins;
}
