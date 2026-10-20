import { z } from "zod";
import { env } from "../lib/env.js";
import { generateWithRetry } from "./chat.js";

/** Kategori materi (sama dengan filter Learning Materials). */
export const MATERIAL_CATEGORIES = ["K-12", "Vocational", "University", "Career", "Sign Language"] as const;
export const MATERIAL_LANGUAGES = ["en", "id"] as const;

// Gambar default (aset frontend) untuk artikel buatan guru.
export const ARTICLE_THUMBNAIL = "/learning-materials/classroom.png";
export const LIVE_CLASS_THUMBNAIL = "/learning-materials/online-class.png";

export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}`;
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export interface Cue {
  text: string;
  offset: number; // ms
  duration: number; // ms
}

/**
 * Caption YouTube (potongan pendek) -> paragraf transkrip materi. Paragraf
 * ditutup di akhir kalimat setelah cukup panjang, supaya mudah dibaca.
 */
export function cuesToParagraphs(cues: Cue[], targetChars = 360): string[] {
  const paragraphs: string[] = [];
  let current = "";
  for (const cue of cues) {
    const text = cue.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    current = current ? `${current} ${text}` : text;
    if (current.length >= targetChars && /[.!?…]$/.test(current)) {
      paragraphs.push(current);
      current = "";
    } else if (current.length >= targetChars * 2) {
      paragraphs.push(current);
      current = "";
    }
  }
  if (current) paragraphs.push(current);
  return paragraphs;
}

/** Durasi video (menit, dibulatkan ke atas) dari caption terakhir. */
export function cuesDurationMinutes(cues: Cue[]): number | null {
  const last = cues.at(-1);
  if (!last) return null;
  return Math.max(1, Math.ceil((last.offset + last.duration) / 60_000));
}

const generatedSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(300),
  sections: z.array(z.string().trim().min(1)).min(1).max(10),
  quiz: z
    .array(
      z.object({
        question: z.string().trim().min(1).max(300),
        options: z.array(z.string().trim().min(1).max(160)).length(4),
        correctIndex: z.number().int().min(0).max(3),
      }),
    )
    .min(3)
    .max(8),
});

export type GeneratedMaterial = z.infer<typeof generatedSchema>;

/** Validasi keluaran model (JSON string) -> materi siap simpan; melempar bila tidak valid. */
export function parseGeneratedMaterial(raw: string): GeneratedMaterial {
  const parsed = generatedSchema.parse(JSON.parse(raw));
  // Pilihan ganda harus berbeda supaya jawaban benar tidak ambigu.
  for (const q of parsed.quiz) {
    if (new Set(q.options.map((o) => o.toLowerCase())).size !== q.options.length) {
      throw new Error(`Pilihan jawaban duplikat: ${q.question}`);
    }
  }
  return parsed;
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Short title of the lesson (max 120 characters)" },
    description: { type: "string", description: "One or two sentence summary (max 300 characters)" },
    sections: {
      type: "array",
      description: "2-6 Markdown sections, each starting with a '## ' heading",
      items: { type: "string" },
    },
    quiz: {
      type: "array",
      description: "5 multiple-choice questions about the lesson",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          options: { type: "array", items: { type: "string" }, description: "Exactly 4 distinct options" },
          correctIndex: { type: "integer", description: "Index (0-3) of the correct option" },
        },
        required: ["question", "options", "correctIndex"],
      },
    },
  },
  required: ["title", "description", "sections", "quiz"],
};

const LANGUAGE_NAMES: Record<string, string> = { en: "English", id: "Indonesian (Bahasa Indonesia)" };

/**
 * Transkrip Kelas Live -> artikel belajar yang aksesibel untuk murid Tuli
 * (kalimat jelas, berstruktur) + kuis pilihan ganda, lewat Gemini (JSON terstruktur).
 */
export async function generateMaterialFromTranscript(input: {
  classTitle: string;
  language: string;
  transcript: string[];
}): Promise<GeneratedMaterial> {
  const language = LANGUAGE_NAMES[input.language] ?? "English";
  const prompt = `You turn a teacher's live class transcript into a learning article for Deaf and hard-of-hearing students.

Rules:
- Write in ${language}.
- Use only information from the transcript. Do not invent facts.
- Use short, clear sentences and plain words. Explain key terms the first time they appear.
- Organize the article into 2-6 sections. Each section is Markdown and starts with a "## " heading; use bullet lists where they help.
- Write 5 multiple-choice questions that check understanding of the article. Each has exactly 4 distinct options and one correct answer.

Class title: ${input.classTitle}

Transcript:
${input.transcript.join("\n")}`;

  const response = await generateWithRetry({
    model: env.GEMINI_MODEL,
    contents: prompt,
    config: {
      temperature: 0.3,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      responseJsonSchema: RESPONSE_SCHEMA,
    },
  });
  const raw = response.text;
  if (!raw) throw new Error("Gemini tidak mengembalikan materi");
  return parseGeneratedMaterial(raw);
}
