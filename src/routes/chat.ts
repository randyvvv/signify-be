import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { materials } from "../db/schema.js";
import { env } from "../lib/env.js";
import { AppError, notFound, serviceUnavailable } from "../lib/errors.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import {
  buildMaterialContext,
  generateGroundedReply,
  getExistingChatSession,
  getOrCreateChatSession,
  loadRecentMessages,
  maybeSummarizeSession,
  saveChatTurn,
} from "../services/chat.js";

const route = new Hono<{ Variables: AuthVariables }>();
route.use("*", requireAuth);

const chatSchema = z.object({
  materialId: z.string().uuid(),
  message: z.string().min(1),
});

/**
 * POST /api/chat — chatbot "Signify".
 *
 * Grounded chatbot for learning materials. It answers from the selected
 * material's transcript/content and stores per-user chat history.
 */
route.get("/", async (c) => {
  const userId = c.get("userId");
  const parsed = z
    .object({ materialId: z.string().uuid() })
    .safeParse({ materialId: c.req.query("materialId") });
  if (!parsed.success) {
    return c.json({ error: "materialId wajib berupa UUID", code: "bad_request" }, 400);
  }

  const session = await getExistingChatSession(userId, parsed.data.materialId);
  if (!session) return c.json({ sessionId: null, messages: [] });

  const messages = await loadRecentMessages(session.id, 50);
  return c.json({ sessionId: session.id, messages });
});

route.post("/", zValidator("json", chatSchema), async (c) => {
  if (!env.AI_ENABLED) {
    throw serviceUnavailable(
      "Fitur AI belum tersedia (model masih dalam pengembangan)",
      "ai_unavailable",
    );
  }

  const userId = c.get("userId");
  const { materialId, message } = c.req.valid("json");

  const material = await db.query.materials.findFirst({
    where: eq(materials.id, materialId),
  });
  if (!material) throw notFound("Material tidak ditemukan");

  const session = await getOrCreateChatSession(userId, materialId);
  const recentMessages = await loadRecentMessages(session.id, 10);
  const materialContext = buildMaterialContext(material);

  let reply: string;
  try {
    reply = await generateGroundedReply({
      materialContext,
      summary: session.summary,
      recentMessages,
      message,
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error(err);
    throw serviceUnavailable("Gagal memanggil Gemini", "ai_request_failed");
  }

  await saveChatTurn(session.id, message, reply);
  maybeSummarizeSession(session.id).catch((err) => {
    console.error("Gagal membuat ringkasan chat", err);
  });

  return c.json({ reply, model: env.GEMINI_MODEL, sessionId: session.id });
});

export default route;
