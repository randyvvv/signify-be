import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { poseCache, signDictionary } from "../db/schema.js";
import { env } from "../lib/env.js";
import { serviceUnavailable } from "../lib/errors.js";

/** Bahasa isyarat yang bisa dipilih user (dukungan penyedia eksternal diatur POSE_API_LANGUAGES). */
export const SIGN_LANGUAGES = [
  { code: "ase", name: "American Sign Language (ASL)" },
  { code: "ins", name: "Indonesian Sign Language (BISINDO)" },
] as const;

export type SignLanguageCode = (typeof SIGN_LANGUAGES)[number]["code"];
export const SIGN_LANGUAGE_CODES = SIGN_LANGUAGES.map((l) => l.code) as [
  SignLanguageCode,
  ...SignLanguageCode[],
];

export type PoseProvider = "signmt" | "signgpt";

/** Nama penyedia teks -> isyarat untuk ditampilkan ke user. */
export const POSE_PROVIDER_LABEL: Record<PoseProvider, string> = {
  signmt: "sign.mt",
  signgpt: "SignGPT",
};

/** Apakah bahasa isyarat ini diterjemahkan penyedia eksternal (selain kamus lokal)? */
export function isExternalPoseLanguage(code: string): boolean {
  return env.POSE_API_LANGUAGES.includes(code);
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
  /** Teks asli segmen (dipakai untuk penyedia eksternal / label). */
  text: string;
  /** Kunci kamus bila segmen ini ada di kamus, selain itu null. */
  dictionaryKey: string | null;
}

/**
 * Pecah teks jadi segmen: frasa terpanjang (maks `maxPhrase` kata) yang ada di
 * kamus diambil dari kamus; kata-kata di antaranya digabung jadi satu segmen
 * untuk penyedia eksternal. Fungsi murni (mudah dites).
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

export interface ExternalPoseRequest {
  provider: PoseProvider;
  url: string;
  text: string;
  signedLanguage: string;
  spokenLanguage: string;
  fetchImpl?: typeof fetch;
}

/**
 * Ambil file .pose (base64) dari penyedia eksternal.
 * - sign.mt : GET ?text=&spoken=&signed= -> biner application/pose
 * - SignGPT : POST JSON -> { pose: base64 }
 * Mengembalikan null bila penyedia tidak punya isyarat untuk teks ini
 * (mis. sign.mt "No poses found"); melempar error untuk gangguan lain.
 */
export async function fetchExternalPose(req: ExternalPoseRequest): Promise<string | null> {
  const doFetch = req.fetchImpl ?? fetch;
  const signal = AbortSignal.timeout(30_000);

  if (req.provider === "signmt") {
    const url = new URL(req.url);
    url.searchParams.set("text", req.text);
    url.searchParams.set("spoken", req.spokenLanguage);
    url.searchParams.set("signed", req.signedLanguage);
    const res = await doFetch(url, { signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (/no poses found/i.test(body)) return null;
      throw new Error(`sign.mt ${res.status}`);
    }
    const pose = Buffer.from(await res.arrayBuffer()).toString("base64");
    if (!isValidPoseBase64(pose)) throw new Error("sign.mt mengembalikan file .pose tidak valid");
    return pose;
  }

  const res = await doFetch(req.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      signedLanguage: req.signedLanguage,
      spokenLanguage: req.spokenLanguage,
      text: req.text,
    }),
    signal,
  });
  if (!res.ok) throw new Error(`SignGPT ${res.status}`);
  const data = (await res.json()) as { pose?: string };
  if (!data.pose) throw new Error("SignGPT tidak mengembalikan pose");
  return data.pose;
}

/** Pose dari penyedia eksternal aktif, dengan cache di tabel pose_cache. */
async function externalPose(
  text: string,
  signedLanguage: string,
  spokenLanguage: string,
): Promise<string | null> {
  const cacheKey = text.trim();
  const cached = await db.query.poseCache.findFirst({
    where: and(
      eq(poseCache.text, cacheKey),
      eq(poseCache.signedLanguage, signedLanguage),
      eq(poseCache.spokenLanguage, spokenLanguage),
    ),
  });
  if (cached) return cached.pose;

  const provider = env.POSE_PROVIDER;
  const pose = await fetchExternalPose({
    provider,
    url: provider === "signmt" ? env.SIGN_MT_URL : env.SIGNGPT_URL,
    text: cacheKey,
    signedLanguage,
    spokenLanguage,
  });
  if (!pose) return null;

  await db
    .insert(poseCache)
    .values({ text: cacheKey, signedLanguage, spokenLanguage, pose })
    .onConflictDoNothing();
  return pose;
}

export interface PoseClipResult {
  text: string;
  source: "dictionary" | PoseProvider;
  /** File .pose dalam base64. */
  pose: string;
}

export interface TranslateResult {
  clips: PoseClipResult[];
  /** Segmen yang tidak bisa diterjemahkan (tak ada di kamus & tak tersedia di penyedia eksternal). */
  missing: string[];
}

/** Teks -> daftar klip pose berurutan (kamus lokal dulu, sisanya penyedia eksternal). */
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

  // Tanpa entri kamus: kirim teks utuh ke penyedia eksternal (tetap dengan tanda baca).
  const segments: PlannedSegment[] = dict.size
    ? planSegments(text, (k) => dict.has(k))
    : [{ text: text.trim(), dictionaryKey: null }];

  const useExternal = isExternalPoseLanguage(signedLanguage);
  const clips: PoseClipResult[] = [];
  const missing: string[] = [];
  let lastError: unknown;

  for (const seg of segments) {
    if (seg.dictionaryKey) {
      clips.push({ text: seg.text, source: "dictionary", pose: dict.get(seg.dictionaryKey)! });
      continue;
    }
    if (!useExternal) {
      missing.push(seg.text);
      continue;
    }
    try {
      const pose = await externalPose(seg.text, signedLanguage, spokenLanguage);
      if (pose) clips.push({ text: seg.text, source: env.POSE_PROVIDER, pose });
      else missing.push(seg.text);
    } catch (err) {
      lastError = err;
      missing.push(seg.text);
    }
  }

  if (clips.length === 0 && lastError) {
    console.error("[translate-pose]", lastError);
    throw serviceUnavailable(
      `Gagal memanggil layanan terjemahan isyarat (${POSE_PROVIDER_LABEL[env.POSE_PROVIDER]})`,
      "pose_provider_failed",
    );
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
