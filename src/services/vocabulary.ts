import { eq } from "drizzle-orm";
import { userPreferences, userVocabulary } from "../db/schema.js";
import { todayStr } from "./activity.js";
import { normalizeWord } from "./sign-translate.js";
import type { Executor } from "./executor.js";

export type Rating = "again" | "hard" | "good" | "easy";
export type VocabularySource = "practice" | "quiz" | "translator" | "manual";

export interface CardState {
  repetitions: number;
  intervalDays: number;
  ease: number; // x100
  lapses: number;
}

const MIN_EASE = 130;

function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return todayStr(d);
}

/**
 * Jadwal review berikutnya (varian SM-2 ala Anki). Fungsi murni.
 * - again : ulang dari awal, besok muncul lagi, ease turun
 * - hard  : interval naik sedikit, ease turun
 * - good  : 1 -> 3 -> interval x ease
 * - easy  : lompat lebih jauh, ease naik
 */
export function schedule(
  card: CardState,
  rating: Rating,
  today: string,
): CardState & { dueDate: string } {
  let { repetitions, intervalDays, ease, lapses } = card;

  switch (rating) {
    case "again":
      repetitions = 0;
      lapses += 1;
      intervalDays = 1;
      ease = Math.max(MIN_EASE, ease - 20);
      break;
    case "hard":
      intervalDays = repetitions === 0 ? 1 : Math.max(intervalDays + 1, Math.round(intervalDays * 1.2));
      ease = Math.max(MIN_EASE, ease - 15);
      repetitions += 1;
      break;
    case "good":
      intervalDays =
        repetitions === 0 ? 1 : repetitions === 1 ? 3 : Math.round((intervalDays * ease) / 100);
      repetitions += 1;
      break;
    case "easy":
      intervalDays =
        repetitions === 0 ? 4 : Math.round(((intervalDays * ease) / 100) * 1.3);
      ease += 15;
      repetitions += 1;
      break;
  }

  return { repetitions, intervalDays, ease, lapses, dueDate: addDays(today, intervalDays) };
}

/** Bahasa isyarat pilihan user (default ASL). */
export async function getSignLanguage(exec: Executor, userId: string): Promise<string> {
  const [row] = await exec
    .select({ signLanguage: userPreferences.signLanguage })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));
  return row?.signLanguage ?? "ase";
}

/**
 * Tambahkan kata ke kosakata user (kata yang sudah ada dibiarkan).
 * Kata baru langsung jatuh tempo hari ini supaya bisa segera direview.
 */
export async function addVocabulary(
  exec: Executor,
  userId: string,
  words: string[],
  source: VocabularySource,
  signedLanguage?: string,
): Promise<void> {
  const unique = [...new Set(words.map(normalizeWord).filter(Boolean))];
  if (unique.length === 0) return;
  const lang = signedLanguage ?? (await getSignLanguage(exec, userId));
  const today = todayStr();

  await exec
    .insert(userVocabulary)
    .values(unique.map((word) => ({ userId, word, signedLanguage: lang, source, dueDate: today })))
    .onConflictDoNothing();
}
