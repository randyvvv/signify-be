import { Hono } from "hono";
import type { WSContext, WSEvents } from "hono/ws";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { count, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { liveClasses, liveClassSegments, materials, quizQuestions, quizzes } from "../db/schema.js";
import { verifyToken } from "../lib/auth.js";
import { env } from "../lib/env.js";
import { badRequest, conflict, forbidden, notFound, serviceUnavailable } from "../lib/errors.js";
import { requireTeacher } from "../lib/teacher.js";
import { readingMinutes } from "../services/news.js";
import {
  LIVE_CLASS_THUMBNAIL,
  MATERIAL_CATEGORIES,
  generateMaterialFromTranscript,
} from "../services/teacher-content.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import {
  findLiveClassByCode,
  listSegments,
  liveRooms,
  toLiveClassDto,
  type LiveClient,
  type LiveServerEvent,
} from "../services/live-class.js";
import { generateClassCode, normalizeClassCode } from "../services/live-transcript.js";
import { SIGN_LANGUAGE_CODES } from "../services/sign-translate.js";

const live = new Hono<{ Variables: AuthVariables }>();
live.use("/classes", requireAuth);
live.use("/classes/*", requireAuth);

async function classByCode(code: string) {
  const row = await findLiveClassByCode(normalizeClassCode(code));
  if (!row) throw notFound("Kelas tidak ditemukan. Cek lagi kodenya.", "class_not_found");
  return row;
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
  spokenLanguage: z.enum(["en", "id"]).default("en"),
  signedLanguage: z.enum(SIGN_LANGUAGE_CODES).optional(),
});

// GET /api/live/classes -> kelas milik guru yang login (terbaru dulu) + jumlah kalimat transkrip
live.get("/classes", async (c) => {
  const userId = c.get("userId");
  const teacher = await requireTeacher(userId);
  const rows = await db
    .select({ cls: liveClasses, segmentCount: count(liveClassSegments.id) })
    .from(liveClasses)
    .leftJoin(liveClassSegments, eq(liveClassSegments.classId, liveClasses.id))
    .where(eq(liveClasses.teacherId, userId))
    .groupBy(liveClasses.id)
    .orderBy(desc(liveClasses.createdAt))
    .limit(50);
  return c.json(
    rows.map(({ cls, segmentCount }) => ({
      ...toLiveClassDto(cls, teacher.fullName),
      segmentCount,
      materialId: cls.materialId,
      quizId: cls.quizId,
    })),
  );
});

// POST /api/live/classes -> buat kelas baru (kode gabung dibuat otomatis)
live.post("/classes", zValidator("json", createSchema), async (c) => {
  const userId = c.get("userId");
  const teacher = await requireTeacher(userId);
  const { title, spokenLanguage } = c.req.valid("json");
  const signedLanguage =
    c.req.valid("json").signedLanguage ?? (spokenLanguage === "id" ? "ins" : "ase");

  for (let attempt = 0; attempt < 5; attempt++) {
    const [created] = await db
      .insert(liveClasses)
      .values({ code: generateClassCode(), teacherId: userId, title, spokenLanguage, signedLanguage })
      .onConflictDoNothing({ target: liveClasses.code })
      .returning();
    if (created) return c.json(toLiveClassDto(created, teacher.fullName), 201);
  }
  throw serviceUnavailable("Gagal membuat kode kelas, coba lagi", "code_unavailable");
});

// GET /api/live/classes/:code -> info kelas + status siaran (untuk halaman gabung)
live.get("/classes/:code", async (c) => {
  const { cls, teacherName } = await classByCode(c.req.param("code"));
  const room = liveRooms.find(cls.id);
  return c.json({
    ...toLiveClassDto(cls, teacherName),
    broadcasting: room?.broadcasting ?? false,
    viewers: room?.viewers ?? 0,
    isTeacher: cls.teacherId === c.get("userId"),
    materialId: cls.materialId,
    quizId: cls.quizId,
  });
});

// GET /api/live/classes/:code/segments -> transkrip lengkap
live.get("/classes/:code/segments", async (c) => {
  const { cls } = await classByCode(c.req.param("code"));
  return c.json(await listSegments(cls.id));
});

// POST /api/live/classes/:code/end -> akhiri kelas (hanya guru pemilik)
live.post("/classes/:code/end", async (c) => {
  const { cls, teacherName } = await classByCode(c.req.param("code"));
  if (cls.teacherId !== c.get("userId")) throw forbidden("Hanya guru kelas ini yang bisa mengakhirinya");
  const room = liveRooms.find(cls.id);
  if (room) {
    await room.end();
  } else if (cls.status !== "ended") {
    const now = new Date();
    await db
      .update(liveClasses)
      .set({ status: "ended", endedAt: now, updatedAt: now })
      .where(eq(liveClasses.id, cls.id));
  }
  const ended = await classByCode(cls.code);
  return c.json(toLiveClassDto(ended.cls, teacherName));
});

const toMaterialSchema = z.object({ category: z.enum(MATERIAL_CATEGORIES).default("K-12") });

// POST /api/live/classes/:code/material -> transkrip kelas jadi artikel belajar + kuis (Gemini)
live.post("/classes/:code/material", zValidator("json", toMaterialSchema), async (c) => {
  const userId = c.get("userId");
  const { cls } = await classByCode(c.req.param("code"));
  if (cls.teacherId !== userId) throw forbidden("Hanya guru kelas ini yang bisa membuat materinya");
  if (cls.materialId) throw conflict("Materi untuk kelas ini sudah dibuat", "material_exists");
  const segments = await listSegments(cls.id);
  if (segments.length < 3) throw badRequest("Transkrip kelas terlalu pendek untuk dijadikan materi", "transcript_too_short");
  if (!env.AI_ENABLED || !env.GEMINI_API_KEY) {
    throw serviceUnavailable("Fitur AI belum dikonfigurasi di server", "ai_unavailable");
  }

  const transcript = segments.map((s) => s.text);
  let generated;
  try {
    generated = await generateMaterialFromTranscript({
      classTitle: cls.title,
      language: cls.spokenLanguage,
      transcript,
    });
  } catch (err) {
    console.error("[live] gagal membuat materi:", err instanceof Error ? err.message : err);
    throw serviceUnavailable("AI gagal menyusun materi, coba lagi", "generation_failed");
  }

  const { category } = c.req.valid("json");
  const result = await db.transaction(async (tx) => {
    const [material] = await tx
      .insert(materials)
      .values({
        title: generated.title,
        description: generated.description,
        type: "article",
        category,
        language: cls.spokenLanguage,
        content: generated.sections,
        transcript,
        durationMinutes: readingMinutes(generated.sections.join("\n\n")),
        pages: generated.sections.length,
        thumbnailUrl: LIVE_CLASS_THUMBNAIL,
        ownerId: userId,
      })
      .returning();
    const [quiz] = await tx
      .insert(quizzes)
      .values({
        title: `Quiz: ${generated.title}`.slice(0, 160),
        description: `Check your understanding of "${generated.title}".`,
        category,
        level: "BEGINNER",
      })
      .returning();
    await tx.insert(quizQuestions).values(
      generated.quiz.map((q, i) => ({
        quizId: quiz!.id,
        ordering: i,
        type: "text",
        question: q.question,
        options: q.options,
        correctIndex: q.correctIndex,
      })),
    );
    await tx
      .update(liveClasses)
      .set({ materialId: material!.id, quizId: quiz!.id, updatedAt: new Date() })
      .where(eq(liveClasses.id, cls.id));
    return { materialId: material!.id, quizId: quiz!.id, title: generated.title, questions: generated.quiz.length };
  });
  return c.json(result, 201);
});

export default live;

// Batas waktu kirim pesan auth setelah koneksi terbuka.
const AUTH_TIMEOUT_MS = 10_000;

const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("auth"), token: z.string().min(1), code: z.string().min(1) }),
  z.object({ type: z.enum(["start", "stop", "end"]) }),
]);

function sendEvent(ws: WSContext, event: LiveServerEvent) {
  ws.send(JSON.stringify(event));
}

/**
 * WebSocket /api/live/ws. Pesan pertama wajib `{type:"auth", token, code}` (JWT
 * dari login, bukan di URL supaya tidak tercatat di log). Setelah itu guru
 * mengirim audio PCM 16 kHz (biner) + perintah start/stop/end; murid hanya
 * menerima event subtitle, segmen, dan status.
 */
export function liveSocketEvents(): WSEvents {
  let client: LiveClient | null = null;
  let room: Awaited<ReturnType<typeof liveRooms.open>> | null = null;
  let authenticating = false;
  let closed = false;
  let authTimer: NodeJS.Timeout | null = null;

  return {
    onOpen(_event, ws) {
      authTimer = setTimeout(() => {
        if (!client) ws.close(4401, "auth timeout");
      }, AUTH_TIMEOUT_MS);
    },

    async onMessage(event, ws) {
      if (typeof event.data !== "string") {
        if (client && room && event.data instanceof ArrayBuffer) room.audio(client, event.data);
        return;
      }

      let parsed: z.infer<typeof clientMessageSchema>;
      try {
        parsed = clientMessageSchema.parse(JSON.parse(event.data));
      } catch {
        return;
      }

      if (parsed.type !== "auth") {
        if (client && room) await room.command(client, parsed.type);
        return;
      }
      if (client || authenticating) return;
      authenticating = true;

      let userId: string;
      try {
        userId = (await verifyToken(parsed.token)).sub;
      } catch {
        sendEvent(ws, { type: "error", message: "Sesi login tidak valid, silakan login ulang", code: "unauthorized" });
        ws.close(4401, "unauthorized");
        return;
      }
      const row = await findLiveClassByCode(normalizeClassCode(parsed.code));
      if (!row) {
        sendEvent(ws, { type: "error", message: "Kelas tidak ditemukan", code: "class_not_found" });
        ws.close(4404, "class not found");
        return;
      }

      if (authTimer) clearTimeout(authTimer);
      if (closed) return;
      const joined: LiveClient = { ws, userId, role: row.cls.teacherId === userId ? "teacher" : "student" };
      room = await liveRooms.open(row.cls, row.teacherName);
      client = joined;
      await room.join(joined);
      // Koneksi tertutup saat proses gabung masih berjalan.
      if (closed) room.leave(joined);
    },

    onClose() {
      closed = true;
      if (authTimer) clearTimeout(authTimer);
      if (client && room) room.leave(client);
    },

    onError(event) {
      console.error("[live-ws] error:", event);
    },
  };
}
