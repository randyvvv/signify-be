import { Modality } from "@google/genai";
import { env } from "../lib/env.js";
import { serviceUnavailable } from "../lib/errors.js";
import { generateWithRetry, getGeminiClient, minimalThinking } from "./chat.js";

/** Isyarat -> Suara: kalimat dari isyarat dibacakan dengan suara Gemini TTS. */

export const SPEECH_LANGUAGES = ["id", "en"] as const;
export type SpeechLanguage = (typeof SPEECH_LANGUAGES)[number];

// Suara bawaan Gemini TTS (multibahasa, termasuk Bahasa Indonesia).
export const SPEECH_VOICES = { female: "Kore", male: "Puck" } as const;
export type SpeechVoice = keyof typeof SPEECH_VOICES;

export const MAX_SPEECH_CHARS = 500;
const DEFAULT_SAMPLE_RATE = 24_000;

export function normalizeSpeechText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Laju sampel dari mimeType Gemini, mis. "audio/L16;codec=pcm;rate=24000". */
export function sampleRateFromMime(mimeType: string | undefined): number {
  const rate = Number(/rate=(\d+)/i.exec(mimeType ?? "")?.[1]);
  return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_SAMPLE_RATE;
}

/** Bungkus PCM 16-bit mono dengan header WAV supaya bisa diputar langsung oleh <audio>. */
export function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const channels = 1;
  const bytesPerSample = 2;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  header.writeUInt16LE(channels * bytesPerSample, 32);
  header.writeUInt16LE(bytesPerSample * 8, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

// Cache audio di memori: frasa yang sering dipakai ("Terima kasih", "Tolong ulangi")
// tidak perlu memanggil Gemini lagi. Map menjaga urutan sisip, jadi entri terdepan = tertua.
const CACHE_MAX_BYTES = 32 * 1024 * 1024;
const audioCache = new Map<string, Buffer>();
let cacheBytes = 0;
const inFlight = new Map<string, Promise<Buffer>>();

function cacheGet(key: string): Buffer | undefined {
  const hit = audioCache.get(key);
  if (hit) {
    audioCache.delete(key);
    audioCache.set(key, hit);
  }
  return hit;
}

function cachePut(key: string, audio: Buffer) {
  audioCache.set(key, audio);
  cacheBytes += audio.length;
  for (const [oldKey, old] of audioCache) {
    if (cacheBytes <= CACHE_MAX_BYTES) break;
    audioCache.delete(oldKey);
    cacheBytes -= old.length;
  }
}

async function generateSpeech(text: string, voice: SpeechVoice): Promise<Buffer> {
  let response;
  try {
    response = await getGeminiClient().models.generateContent({
      model: env.TTS_MODEL,
      contents: [{ role: "user", parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: SPEECH_VOICES[voice] } } },
      },
    });
  } catch (err) {
    console.error("[speech] tts:", err instanceof Error ? err.message : err);
    throw serviceUnavailable("Suara belum bisa dibuat, coba lagi", "tts_failed");
  }

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const audio = parts
    .map((p) => p.inlineData)
    .filter((d): d is { data: string; mimeType?: string } => !!d?.data && !!d.mimeType?.startsWith("audio/"));
  if (audio.length === 0) {
    throw serviceUnavailable("Suara belum bisa dibuat, coba lagi", "tts_failed");
  }
  const mimeType = audio[0]?.mimeType;
  const bytes = Buffer.concat(audio.map((d) => Buffer.from(d.data, "base64")));
  return /wav/i.test(mimeType ?? "") ? bytes : pcmToWav(bytes, sampleRateFromMime(mimeType));
}

/** Teks -> audio WAV (Gemini TTS), dengan cache dan penggabungan permintaan yang sama. */
export async function synthesizeSpeech(text: string, voice: SpeechVoice): Promise<Buffer> {
  if (!env.AI_ENABLED || !env.GEMINI_API_KEY) {
    throw serviceUnavailable("Fitur AI belum dikonfigurasi di server", "ai_unavailable");
  }
  const key = `${env.TTS_MODEL}|${voice}|${text}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  let pending = inFlight.get(key);
  if (!pending) {
    pending = generateSpeech(text, voice)
      .then((audio) => {
        cachePut(key, audio);
        return audio;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }
  return pending;
}

const LANGUAGE_NAMES: Record<SpeechLanguage, string> = { id: "Indonesian", en: "English" };

function sentenceInstruction(lang: SpeechLanguage) {
  return `You help a Deaf person talk with a hearing person.
The input is what the Deaf person signed: sign language glosses in signing order, often uppercase and without grammar, or text they typed.
Rewrite it as one short, natural sentence in ${LANGUAGE_NAMES[lang]} that they would say out loud, in the first person.
Keep the meaning. Do not add facts, greetings or explanations. If the input is already a natural sentence, only fix capitalization and punctuation.
Reply with the sentence only.`;
}

/** Bersihkan jawaban model: satu baris, tanpa tanda kutip pembungkus. */
export function cleanSentence(raw: string | undefined, fallback: string): string {
  const line = (raw ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  const text = normalizeSpeechText((line ?? "").replace(/^["'“”`]+|["'“”`]+$/g, ""));
  return text ? text.slice(0, MAX_SPEECH_CHARS) : fallback;
}

/** Gloss isyarat ("SAYA MAU KOPI DUA") -> kalimat lisan yang wajar ("Saya mau dua kopi."). */
export async function composeSentence(text: string, lang: SpeechLanguage): Promise<string> {
  if (!env.AI_ENABLED || !env.GEMINI_API_KEY) {
    throw serviceUnavailable("Fitur AI belum dikonfigurasi di server", "ai_unavailable");
  }
  try {
    const response = await generateWithRetry({
      model: env.GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text }] }],
      config: {
        systemInstruction: sentenceInstruction(lang),
        temperature: 0.2,
        maxOutputTokens: 256,
        thinkingConfig: minimalThinking(),
      },
    });
    return cleanSentence(response.text, text);
  } catch (err) {
    console.error("[speech] sentence:", err instanceof Error ? err.message : err);
    throw serviceUnavailable("Kalimat belum bisa disusun, coba lagi", "ai_request_failed");
  }
}
