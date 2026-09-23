import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, eq, ilike } from "drizzle-orm";
import { db } from "../db/index.js";
import { signDictionary } from "../db/schema.js";
import { env } from "../lib/env.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import {
  SIGN_LANGUAGES,
  SIGN_LANGUAGE_CODES,
  isSignGptLanguage,
  isValidPoseBase64,
  normalizeWord,
} from "../services/sign-translate.js";

const route = new Hono<{ Variables: AuthVariables }>();
route.use("*", requireAuth);

// Batas ukuran file .pose (base64) yang boleh diunggah: ~3 MB.
const MAX_POSE_LENGTH = 4_000_000;

const isAdmin = (email: string) => env.ADMIN_EMAILS.includes(email.toLowerCase());

// GET /signs/languages -> bahasa isyarat yang tersedia + izin edit kamus
route.get("/languages", (c) =>
  c.json({
    languages: SIGN_LANGUAGES.map((l) => ({ ...l, signGpt: isSignGptLanguage(l.code) })),
    canEdit: isAdmin(c.get("email")),
  }),
);

// GET /signs?lang=&search=  -> daftar entri kamus (tanpa data pose)
route.get("/", async (c) => {
  const lang = c.req.query("lang")?.trim();
  const search = c.req.query("search")?.trim();

  const conditions = [];
  if (lang) conditions.push(eq(signDictionary.signedLanguage, lang));
  if (search) conditions.push(ilike(signDictionary.word, `%${normalizeWord(search)}%`));

  const rows = await db
    .select({
      id: signDictionary.id,
      word: signDictionary.word,
      signedLanguage: signDictionary.signedLanguage,
      createdAt: signDictionary.createdAt,
    })
    .from(signDictionary)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(signDictionary.word))
    .limit(500);
  return c.json(rows);
});

const upsertSchema = z.object({
  word: z.string().min(1).max(80),
  signedLanguage: z.enum(SIGN_LANGUAGE_CODES),
  pose: z.string().min(1).max(MAX_POSE_LENGTH), // base64 file .pose
});

// POST /signs  -> tambah / ganti pose untuk sebuah kata (admin)
route.post("/", zValidator("json", upsertSchema), async (c) => {
  if (!isAdmin(c.get("email"))) throw forbidden("Hanya admin yang bisa mengubah kamus");
  const { word, signedLanguage, pose } = c.req.valid("json");

  const key = normalizeWord(word);
  if (!key) throw badRequest("Kata tidak valid", "invalid_word");
  if (!isValidPoseBase64(pose)) throw badRequest("File .pose tidak valid", "invalid_pose");

  const [row] = await db
    .insert(signDictionary)
    .values({ word: key, signedLanguage, pose, createdBy: c.get("userId") })
    .onConflictDoUpdate({
      target: [signDictionary.word, signDictionary.signedLanguage],
      set: { pose, createdBy: c.get("userId"), createdAt: new Date() },
    })
    .returning({
      id: signDictionary.id,
      word: signDictionary.word,
      signedLanguage: signDictionary.signedLanguage,
      createdAt: signDictionary.createdAt,
    });
  return c.json(row, 201);
});

// DELETE /signs/:id (admin)
route.delete("/:id", async (c) => {
  if (!isAdmin(c.get("email"))) throw forbidden("Hanya admin yang bisa mengubah kamus");
  const deleted = await db
    .delete(signDictionary)
    .where(eq(signDictionary.id, c.req.param("id")))
    .returning({ id: signDictionary.id });
  if (!deleted.length) throw notFound("Entri kamus tidak ditemukan");
  return c.json({ ok: true });
});

export default route;
