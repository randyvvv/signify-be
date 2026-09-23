import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { translatorSessions } from "../db/schema.js";
import { env } from "../lib/env.js";
import { notFound, serviceUnavailable } from "../lib/errors.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import { SIGN_LANGUAGE_CODES, translateTextToPose } from "../services/sign-translate.js";
import { getSignLanguage } from "../services/vocabulary.js";
import { extractVideoId, fetchTranscriptViaApi } from "../services/youtube.js";

const route = new Hono<{ Variables: AuthVariables }>();
route.use("*", requireAuth);

const transcriptSchema = z.object({
  url: z.string().min(1),
  lang: z.string().optional(),
});

// POST /api/translator/transcript — ambil caption YouTube (untuk Live Translator).
route.post("/transcript", zValidator("json", transcriptSchema), async (c) => {
  const { url, lang } = c.req.valid("json");
  const videoId = extractVideoId(url);
  if (!videoId) return c.json({ error: "URL YouTube tidak valid" }, 400);

  try {
    const cues = await fetchTranscriptViaApi(videoId, lang);
    if (cues.length > 0) {
      return c.json({ cues, source: "youtube-transcript.io" });
    }
    return c.json({ error: "Video tidak punya caption." }, 502);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[transcript] error:", detail);
    return c.json({ error: "Gagal mengambil transcript.", detail }, 502);
  }
});

const poseSchema = z.object({
  text: z.string().trim().min(1).max(500),
  signedLanguage: z.enum(SIGN_LANGUAGE_CODES).optional(),
  spokenLanguage: z.string().min(2).max(8).default("en"),
});

/**
 * POST /api/translator/pose — teks -> animasi isyarat (.pose base64 per klip).
 * Kamus lokal (sign_dictionary) diutamakan; sisanya SignGPT (dengan cache).
 * signedLanguage default = preferensi user.
 */
route.post("/pose", zValidator("json", poseSchema), async (c) => {
  const userId = c.get("userId");
  const { text, spokenLanguage } = c.req.valid("json");
  const signedLanguage =
    c.req.valid("json").signedLanguage ?? (await getSignLanguage(db, userId));

  const result = await translateTextToPose(text, signedLanguage, spokenLanguage);
  if (result.clips.length === 0) {
    return c.json(
      {
        error: "Belum ada isyarat untuk teks ini di bahasa isyarat yang dipilih",
        code: "no_sign_available",
        missing: result.missing,
      },
      404,
    );
  }
  return c.json({ signedLanguage, ...result });
});

// Keypoint signify-model: 17 pose + 21 tangan kiri + 21 tangan kanan, masing-masing (x, y, z).
const KEYPOINTS_PER_FRAME = 59;
const recognizeSchema = z.object({
  frames: z
    .array(z.array(z.array(z.number()).length(3)).length(KEYPOINTS_PER_FRAME))
    .min(8)
    .max(900),
  fps: z.number().positive().max(120).optional(),
});

/**
 * POST /api/translator/recognize — isyarat (keypoint MediaPipe) -> teks.
 * Diteruskan ke server inferensi signify-model (SIGN_MODEL_URL).
 * 503 model_unavailable bila server model belum dikonfigurasi.
 */
route.post("/recognize", zValidator("json", recognizeSchema), async (c) => {
  if (!env.SIGN_MODEL_URL) {
    throw serviceUnavailable(
      "Model pengenalan isyarat belum tersedia",
      "model_unavailable",
    );
  }
  const { frames, fps } = c.req.valid("json");

  let res: Response;
  try {
    res = await fetch(env.SIGN_MODEL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keypoints: frames, fps }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    console.error("[recognize]", err);
    throw serviceUnavailable("Server model tidak merespons", "model_request_failed");
  }
  if (!res.ok) {
    console.error("[recognize] model status", res.status, await res.text().catch(() => ""));
    throw serviceUnavailable("Server model gagal memproses", "model_request_failed");
  }

  const data = (await res.json()) as { text?: string; confidence?: number };
  return c.json({ text: data.text?.trim() ?? "", confidence: data.confidence ?? null });
});

const createSchema = z.object({
  sourceUrl: z.string().url(),
});

/**
 * POST /api/translator/sessions — daftarkan URL livestream untuk diterjemahkan.
 *
 * STUB: transkrip/terjemahan diisi worker AI saat model siap. Untuk sekarang
 * sesi dibuat dengan status "pending" dan transcript null.
 */
route.post("/sessions", zValidator("json", createSchema), async (c) => {
  const userId = c.get("userId");
  const { sourceUrl } = c.req.valid("json");

  const [session] = await db
    .insert(translatorSessions)
    .values({ userId, sourceUrl, status: "pending" })
    .returning();

  return c.json(session, 201);
});

// GET /api/translator/sessions — daftar sesi milik user
route.get("/sessions", async (c) => {
  const userId = c.get("userId");
  const rows = await db
    .select()
    .from(translatorSessions)
    .where(eq(translatorSessions.userId, userId))
    .orderBy(desc(translatorSessions.createdAt));
  return c.json(rows);
});

// GET /api/translator/sessions/:id — detail (harus milik user)
route.get("/sessions/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const session = await db.query.translatorSessions.findFirst({
    where: and(eq(translatorSessions.id, id), eq(translatorSessions.userId, userId)),
  });
  if (!session) throw notFound("Sesi translator tidak ditemukan");
  return c.json(session);
});

export default route;
