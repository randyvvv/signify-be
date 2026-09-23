import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { poseCache, signDictionary } from "../db/schema.js";
import { env } from "../lib/env.js";
import { serviceUnavailable } from "../lib/errors.js";

/** Bahasa isyarat yang bisa dipilih user (dukungan SignGPT diatur SIGNGPT_LANGUAGES). */
export const SIGN_LANGUAGES = [
  { code: "ase", name: "American Sign Language (ASL)" },
  { code: "ins", name: "Indonesian Sign Language (BISINDO)" },
] as const;

export type SignLanguageCode = (typeof SIGN_LANGUAGES)[number]["code"];
export const SIGN_LANGUAGE_CODES = SIGN_LANGUAGES.map((l) => l.code) as [
  SignLanguageCode,
  ...SignLanguageCode[],
];

export function isSignGptLanguage(code: string): boolean {
  return env.SIGNGPT_LANGUAGES.includes(code);
}

/** Normalisasi kata/frasa untuk kunci kamus: lowercase, tanpa tanda baca, spasi tunggal. */
export function normalizeWord(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface PlannedSegment {
  /** Teks asli segmen (dipakai untuk SignGPT / label). */
  text: string;
  /** Kunci kamus bila segmen ini ada di kamus, selain itu null. */
  dictionaryKey: string | null;
}

/**
 * Pecah teks jadi segmen: frasa terpanjang (maks `maxPhrase` kata) yang ada di
 * kamus diambil dari kamus; kata-kata di antaranya digabung jadi satu segmen
 * untuk SignGPT. Fungsi murni (mudah dites).
 */
export function planSegments(
  text: string,
  inDictionary: (key: string) => boolean,
  maxPhrase = 4,
): PlannedSegment[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  const keys = tokens.map(normalizeWord);
  const out: PlannedSegment[] = [];
  let pending: string[] = [];

  const flush = () => {
    if (pending.length) out.push({ text: pending.join(" "), dictionaryKey: null });
    pending = [];
  };

  let i = 0;
  while (i < tokens.length) {
    let matched = 0;
    for (let n = Math.min(maxPhrase, tokens.length - i); n >= 1; n--) {
      const key = keys.slice(i, i + n).filter(Boolean).join(" ");
      if (key && inDictionary(key)) {
        matched = n;
        flush();
        out.push({ text: tokens.slice(i, i + n).join(" "), dictionaryKey: key });
        break;
      }
    }
    if (matched) {
      i += matched;
    } else {
      pending.push(tokens[i]!);
      i++;
    }
  }
  flush();
  return out;
}

/** Semua n-gram (1..maxPhrase kata) ter-normalisasi dari teks — kandidat kunci kamus. */
export function candidateKeys(text: string, maxPhrase = 4): string[] {
  const keys = text.split(/\s+/).map(normalizeWord).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i < keys.length; i++) {
    for (let n = 1; n <= maxPhrase && i + n <= keys.length; n++) {
      out.add(keys.slice(i, i + n).join(" "));
    }
  }
  return [...out];
}

async function signGptPose(
  text: string,
  signedLanguage: string,
  spokenLanguage: string,
): Promise<string> {
  const cacheKey = text.trim();
  const cached = await db.query.poseCache.findFirst({
    where: and(
      eq(poseCache.text, cacheKey),
      eq(poseCache.signedLanguage, signedLanguage),
      eq(poseCache.spokenLanguage, spokenLanguage),
    ),
  });
  if (cached) return cached.pose;

  const res = await fetch(env.SIGNGPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedLanguage, spokenLanguage, text: cacheKey }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`SignGPT ${res.status}`);
  const data = (await res.json()) as { pose?: string };
  if (!data.pose) throw new Error("SignGPT tidak mengembalikan pose");

  await db
    .insert(poseCache)
    .values({ text: cacheKey, signedLanguage, spokenLanguage, pose: data.pose })
    .onConflictDoNothing();
  return data.pose;
}

export interface PoseClipResult {
  text: string;
  source: "dictionary" | "signgpt";
  /** File .pose dalam base64. */
  pose: string;
}

export interface TranslateResult {
  clips: PoseClipResult[];
  /** Segmen yang tidak bisa diterjemahkan (tak ada di kamus & bahasa tak didukung SignGPT). */
  missing: string[];
}

/** Teks -> daftar klip pose berurutan (kamus lokal dulu, sisanya SignGPT). */
export async function translateTextToPose(
  text: string,
  signedLanguage: string,
  spokenLanguage: string,
): Promise<TranslateResult> {
  const candidates = candidateKeys(text);
  const entries = candidates.length
    ? await db
        .select({ word: signDictionary.word, pose: signDictionary.pose })
        .from(signDictionary)
        .where(
          and(
            eq(signDictionary.signedLanguage, signedLanguage),
            inArray(signDictionary.word, candidates),
          ),
        )
    : [];
  const dict = new Map(entries.map((e) => [e.word, e.pose]));

  // Tanpa entri kamus: kirim teks utuh ke SignGPT (tetap dengan tanda baca).
  const segments: PlannedSegment[] = dict.size
    ? planSegments(text, (k) => dict.has(k))
    : [{ text: text.trim(), dictionaryKey: null }];

  const useSignGpt = isSignGptLanguage(signedLanguage);
  const clips: PoseClipResult[] = [];
  const missing: string[] = [];
  let lastError: unknown;

  for (const seg of segments) {
    if (seg.dictionaryKey) {
      clips.push({ text: seg.text, source: "dictionary", pose: dict.get(seg.dictionaryKey)! });
      continue;
    }
    if (!useSignGpt) {
      missing.push(seg.text);
      continue;
    }
    try {
      const pose = await signGptPose(seg.text, signedLanguage, spokenLanguage);
      clips.push({ text: seg.text, source: "signgpt", pose });
    } catch (err) {
      lastError = err;
      missing.push(seg.text);
    }
  }

  if (clips.length === 0 && lastError) {
    console.error("[translate-pose]", lastError);
    throw serviceUnavailable("Gagal memanggil SignGPT", "signgpt_failed");
  }
  return { clips, missing };
}

/** Validasi ringan: base64 valid & header .pose versi 0.1/0.2. */
export function isValidPoseBase64(pose: string): boolean {
  try {
    const buf = Buffer.from(pose, "base64");
    if (buf.length < 16) return false;
    const version = Math.round(buf.readFloatLE(0) * 1000) / 1000;
    return version === 0.1 || version === 0.2;
  } catch {
    return false;
  }
}
