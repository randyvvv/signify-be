import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { translatorSessions } from "../db/schema.js";
import { notFound } from "../lib/errors.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";

const route = new Hono<{ Variables: AuthVariables }>();
route.use("*", requireAuth);

// ---- YouTube transcript via youtube-transcript.io API --------------------
// Pakai layanan pihak ketiga (mereka yang urus blokir/anti-bot YouTube).
// Token disimpan di env YT_TRANSCRIPT_IO_TOKEN. offset/duration dalam ms.

function extractVideoId(input: string): string | null {
  const raw = input.trim();
  const m = raw.match(
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([\w-]{11})/,
  );
  if (m) return m[1]!;
  return /^[\w-]{11}$/.test(raw) ? raw : null;
}

interface IoTrack {
  language: string;
  transcript: { start: string; dur: string; text: string }[];
}
interface IoItem {
  id: string;
  tracks?: IoTrack[];
}

async function fetchTranscriptViaApi(videoId: string, lang?: string) {
  const token = process.env.YT_TRANSCRIPT_IO_TOKEN?.trim();
  if (!token) throw new Error("YT_TRANSCRIPT_IO_TOKEN belum diset di .env");

  const res = await fetch("https://www.youtube-transcript.io/api/transcripts", {
    method: "POST",
    headers: {
      Authorization: `Basic ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids: [videoId] }),
  });
  if (!res.ok) throw new Error(`youtube-transcript.io ${res.status}`);

  const data = (await res.json()) as IoItem[];
  const item = data.find((d) => d.id === videoId) ?? data[0];
  const tracks = item?.tracks ?? [];
  if (tracks.length === 0) return [];
  const track =
    (lang ? tracks.find((t) => t.language?.startsWith(lang)) : undefined) ??
    tracks[0]!;
  return (track.transcript ?? [])
    .map((s) => ({
      text: s.text.replace(/\n/g, " ").trim(),
      offset: Math.round(parseFloat(s.start) * 1000),
      duration: Math.round(parseFloat(s.dur) * 1000),
    }))
    .filter((cue) => cue.text);
}

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
