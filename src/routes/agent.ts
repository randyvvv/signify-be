import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { agentSessions } from "../db/schema.js";
import { env } from "../lib/env.js";
import { notFound, serviceUnavailable } from "../lib/errors.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import { todayStr } from "../services/activity.js";
import { getSignLanguage } from "../services/vocabulary.js";
import { COACH_TOOLS } from "../services/agent/tools.js";
import { runAgent } from "../services/agent/runner.js";
import {
  buildSystemInstruction,
  createGeminiGenerate,
  createSession,
  getSession,
  listSessions,
  loadHistory,
  loadMessages,
  saveMessage,
} from "../services/agent/coach.js";
import type { CoachEvent } from "../services/agent/types.js";

const route = new Hono<{ Variables: AuthVariables }>();
route.use("*", requireAuth);

// GET /agent/sessions — daftar percakapan Coach milik user
route.get("/sessions", async (c) => c.json(await listSessions(c.get("userId"))));

// GET /agent/sessions/:id — pesan (lengkap dengan langkah & kartu)
route.get("/sessions/:id", async (c) => {
  const session = await getSession(c.get("userId"), c.req.param("id"));
  if (!session) throw notFound("Percakapan tidak ditemukan");
  const messages = await loadMessages(session.id);
  return c.json({ ...session, messages });
});

// DELETE /agent/sessions/:id
route.delete("/sessions/:id", async (c) => {
  const deleted = await db
    .delete(agentSessions)
    .where(and(eq(agentSessions.id, c.req.param("id")), eq(agentSessions.userId, c.get("userId"))))
    .returning({ id: agentSessions.id });
  if (!deleted.length) throw notFound("Percakapan tidak ditemukan");
  return c.json({ ok: true });
});

const chatSchema = z.object({
  sessionId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(2000),
});

/**
 * POST /agent/chat — jalankan Signify Coach (AI agent dengan tools).
 * Respons berupa Server-Sent Events: session → step/card (berulang) → message → done.
 */
route.post("/chat", zValidator("json", chatSchema), async (c) => {
  if (!env.AI_ENABLED || !env.GEMINI_API_KEY) {
    throw serviceUnavailable("Signify Coach belum aktif (AI dinonaktifkan)", "ai_unavailable");
  }
  const userId = c.get("userId");
  const { sessionId, message } = c.req.valid("json");

  let session = sessionId ? await getSession(userId, sessionId) : undefined;
  if (sessionId && !session) throw notFound("Percakapan tidak ditemukan");
  const history = session ? await loadHistory(session.id) : [];
  session ??= await createSession(userId, message);
  const activeSession = session;

  const signedLanguage = await getSignLanguage(db, userId);
  await saveMessage({ sessionId: activeSession.id, role: "user", content: message });

  return streamSSE(c, async (stream) => {
    let open = true;
    stream.onAbort(() => {
      open = false;
    });
    // Tetap lanjut walau klien menutup koneksi, supaya hasil tersimpan.
    const emit = async (event: CoachEvent) => {
      if (!open) return;
      try {
        await stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
      } catch {
        open = false;
      }
    };

    await emit({ type: "session", sessionId: activeSession.id, title: activeSession.title });

    try {
      const result = await runAgent({
        generate: createGeminiGenerate(COACH_TOOLS, buildSystemInstruction(signedLanguage, todayStr())),
        tools: COACH_TOOLS,
        ctx: { userId, signedLanguage },
        history,
        message,
        emit,
      });
      await saveMessage({
        sessionId: activeSession.id,
        role: "assistant",
        content: result.text,
        steps: result.steps,
        cards: result.cards,
      });
      await emit({ type: "message", text: result.text });
    } catch (err) {
      console.error("[coach]", err);
      const text = "Sorry — I couldn't finish that. Please try again in a moment.";
      await saveMessage({ sessionId: activeSession.id, role: "assistant", content: text });
      await emit({ type: "error", message: text });
    }
    await emit({ type: "done" });
  });
});

export default route;
