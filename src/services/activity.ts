import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { activities, users } from "../db/schema.js";
import type { Executor } from "./executor.js";

/** Tanggal hari ini sebagai string YYYY-MM-DD (UTC). */
export function todayStr(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Hitung nilai streak berikutnya. Fungsi murni (mudah dites).
 * - belum pernah aktif        -> 1
 * - sudah aktif hari ini       -> tidak berubah (minimal 1)
 * - aktif kemarin (beruntun)   -> +1
 * - ada hari yang bolong       -> reset ke 1
 */
export function nextStreak(
  lastActiveDate: string | null,
  today: string,
  current: number,
): number {
  if (!lastActiveDate) return 1;
  if (lastActiveDate === today) return current < 1 ? 1 : current;

  const ms =
    Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastActiveDate}T00:00:00Z`);
  const days = Math.round(ms / 86_400_000);
  return days === 1 ? current + 1 : 1;
}

export interface ActivityInput {
  type: "material" | "quiz" | "practice" | "review";
  title: string;
  referenceId?: string | null;
  durationSeconds?: number;
}

/**
 * Catat satu aktivitas belajar sekaligus:
 * - insert baris ke `activities`
 * - tambah `totalLearningSeconds`
 * - update streak + lastActiveDate
 *
 * Semua dalam satu transaksi. Boleh dipanggil dengan `db` (akan membuka
 * transaksinya sendiri) atau dengan `tx` yang sudah ada.
 */
export async function recordActivity(
  exec: Executor,
  userId: string,
  input: ActivityInput,
): Promise<void> {
  const duration = input.durationSeconds ?? 0;
  const today = todayStr();

  const run = async (tx: Executor) => {
    const [u] = await tx
      .select({ streak: users.streakCount, last: users.lastActiveDate })
      .from(users)
      .where(eq(users.id, userId));
    if (!u) return;

    const streak = nextStreak(u.last, today, u.streak);

    await tx
      .update(users)
      .set({
        streakCount: streak,
        lastActiveDate: today,
        totalLearningSeconds: sql`${users.totalLearningSeconds} + ${duration}`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    await tx.insert(activities).values({
      userId,
      type: input.type,
      referenceId: input.referenceId ?? null,
      title: input.title,
      durationSeconds: duration,
    });
  };

  // Kalau dipanggil dengan `db`, bungkus transaksi sendiri.
  if (exec === db) {
    await db.transaction(run);
  } else {
    await run(exec);
  }
}
