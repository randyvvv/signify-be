import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { env } from "../lib/env.js";
import { serviceUnavailable } from "../lib/errors.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";

const route = new Hono<{ Variables: AuthVariables }>();
route.use("*", requireAuth);

const chatSchema = z.object({
  materialId: z.string().uuid().optional(),
  message: z.string().min(1),
});

/**
 * POST /api/chat — chatbot "Signify".
 *
 * STUB: model AI belum tersedia. Kontrak request/response sudah final supaya
 * FE bisa lanjut. Kalau AI_ENABLED=false -> 503 ai_unavailable. Kalau true,
 * untuk sementara mengembalikan balasan placeholder (belum memanggil model).
 */
route.post("/", zValidator("json", chatSchema), async (c) => {
  if (!env.AI_ENABLED) {
    throw serviceUnavailable(
      "Fitur AI belum tersedia (model masih dalam pengembangan)",
      "ai_unavailable",
    );
  }

  const { message } = c.req.valid("json");
  // TODO: panggil model AI sungguhan saat sudah ada.
  return c.json({
    reply: `(stub) Anda berkata: "${message}". Asisten AI akan segera hadir.`,
    model: null,
  });
});

export default route;
