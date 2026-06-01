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
