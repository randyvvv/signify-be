import { Hono } from "hono";
import type { WSContext, WSEvents } from "hono/ws";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { liveClasses, users } from "../db/schema.js";
import { verifyToken } from "../lib/auth.js";
import { forbidden, notFound, serviceUnavailable } from "../lib/errors.js";
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

async function assertTeacher(userId: string): Promise<{ fullName: string | null }> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (user?.role !== "teacher") {
    throw forbidden("Aktifkan Mode Pengajar di Settings untuk membuat Kelas Live", "teacher_only");
  }
  return user;
}

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

// GET /api/live/classes -> kelas milik guru yang login (terbaru dulu)
live.get("/classes", async (c) => {
  const userId = c.get("userId");
  const teacher = await assertTeacher(userId);
  const rows = await db
    .select()
    .from(liveClasses)
    .where(eq(liveClasses.teacherId, userId))
    .orderBy(desc(liveClasses.createdAt))
    .limit(50);
  return c.json(rows.map((row) => toLiveClassDto(row, teacher.fullName)));
});

// POST /api/live/classes -> buat kelas baru (kode gabung dibuat otomatis)
live.post("/classes", zValidator("json", createSchema), async (c) => {
  const userId = c.get("userId");
  const teacher = await assertTeacher(userId);
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
