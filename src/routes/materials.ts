import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, ilike, ne, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { liveClasses, materials, quizzes, userMaterialProgress } from "../db/schema.js";
import { parsePagination, paginated } from "../lib/pagination.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { requireTeacher } from "../lib/teacher.js";
import { readingMinutes } from "../services/news.js";
import {
  ARTICLE_THUMBNAIL,
  MATERIAL_CATEGORIES,
  MATERIAL_LANGUAGES,
  cuesDurationMinutes,
  cuesToParagraphs,
  youtubeEmbedUrl,
  youtubeThumbnailUrl,
} from "../services/teacher-content.js";
import { extractVideoId, fetchTranscriptViaApi } from "../services/youtube.js";
import { recordActivity } from "../services/activity.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";

const route = new Hono<{ Variables: AuthVariables }>();
route.use("*", requireAuth);

// GET /materials/mine -> materi buatan guru yang login (sebelum "/:id")
route.get("/mine", async (c) => {
  const userId = c.get("userId");
  await requireTeacher(userId);
  const rows = await db
    .select()
    .from(materials)
    .where(eq(materials.ownerId, userId))
    .orderBy(desc(materials.createdAt));
  return c.json(rows);
});

const materialFields = {
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).optional(),
  category: z.enum(MATERIAL_CATEGORIES),
  language: z.enum(MATERIAL_LANGUAGES).default("en"),
};

const createMaterialSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("video"), videoUrl: z.string().trim().min(1), ...materialFields }),
  z.object({
    type: z.literal("article"),
    content: z.string().trim().min(20).max(50_000), // markdown
    articleUrl: z.string().url().optional(),
    ...materialFields,
  }),
]);

// POST /materials -> guru membuat materi (video YouTube atau artikel), langsung tampil di Learning Materials
route.post("/", zValidator("json", createMaterialSchema), async (c) => {
  const userId = c.get("userId");
  await requireTeacher(userId);
  const body = c.req.valid("json");
  const base = {
    title: body.title,
    description: body.description || null,
    category: body.category,
    language: body.language,
    ownerId: userId,
  };

  if (body.type === "video") {
    const videoId = extractVideoId(body.videoUrl);
    if (!videoId) throw badRequest("Link YouTube tidak valid", "invalid_youtube_url");
    // Transkrip dipakai chatbot materi & avatar; video tanpa caption tetap bisa disimpan.
    let transcript: string[] | null = null;
    let durationMinutes: number | null = null;
    try {
      const cues = await fetchTranscriptViaApi(videoId, body.language);
      transcript = cuesToParagraphs(cues);
      durationMinutes = cuesDurationMinutes(cues);
    } catch (err) {
      console.warn("[materials] transkrip YouTube tidak tersedia:", err instanceof Error ? err.message : err);
    }
    const [created] = await db
      .insert(materials)
      .values({
        ...base,
        type: "video",
        videoUrl: youtubeEmbedUrl(videoId),
        // Host thumbnail harus terdaftar di next.config frontend, jadi tidak menerima URL bebas.
        thumbnailUrl: youtubeThumbnailUrl(videoId),
        transcript: transcript?.length ? transcript : null,
        durationMinutes,
      })
      .returning();
    return c.json(created, 201);
  }

  const [created] = await db
    .insert(materials)
    .values({
      ...base,
      type: "article",
      content: [body.content],
      articleUrl: body.articleUrl ?? null,
      thumbnailUrl: ARTICLE_THUMBNAIL,
      durationMinutes: readingMinutes(body.content),
      pages: 1,
    })
    .returning();
  return c.json(created, 201);
});

// DELETE /materials/:id -> hapus materi milik guru sendiri (+ kuis yang dibuat dari kelas yang sama)
route.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const material = await db.query.materials.findFirst({ where: eq(materials.id, c.req.param("id")) });
  if (!material) throw notFound("Material tidak ditemukan");
  if (material.ownerId !== userId) throw forbidden("Hanya pembuat materi yang bisa menghapusnya");
  const linked = await db
    .select({ quizId: liveClasses.quizId })
    .from(liveClasses)
    .where(eq(liveClasses.materialId, material.id));
  await db.transaction(async (tx) => {
    // Kuis kelas bersifat publik; tanpa ini kuisnya tertinggal setelah materinya dihapus.
    for (const { quizId } of linked) if (quizId) await tx.delete(quizzes).where(eq(quizzes.id, quizId));
    await tx.delete(materials).where(eq(materials.id, material.id));
  });
  return c.json({ ok: true });
});

// GET /materials?search=&category=&language=&page=&limit=
route.get("/", async (c) => {
  const userId = c.get("userId");
  const search = c.req.query("search")?.trim();
  const category = c.req.query("category")?.trim();
  const language = c.req.query("language")?.trim();
  const { page, limit, offset } = parsePagination({
    page: c.req.query("page"),
    limit: c.req.query("limit"),
  });

  const conditions = [];
  if (search) conditions.push(ilike(materials.title, `%${search}%`));
  if (category) conditions.push(eq(materials.category, category));
  if (language) conditions.push(eq(materials.language, language));
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, [countRow]] = await Promise.all([
    db
      .select({ material: materials, progress: userMaterialProgress.progress })
      .from(materials)
      .leftJoin(
        userMaterialProgress,
        and(
          eq(userMaterialProgress.materialId, materials.id),
          eq(userMaterialProgress.userId, userId),
        ),
      )
      .where(where)
      .limit(limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)` }).from(materials).where(where),
  ]);

  const items = rows.map((r) => ({ ...r.material, progress: r.progress ?? 0 }));
  return c.json(paginated(items, page, limit, Number(countRow?.total ?? 0)));
});

// GET /materials/categories  -> daftar kategori + jumlah (untuk filter sidebar FE)
route.get("/categories", async (c) => {
  const rows = await db
    .select({ name: materials.category, count: sql<number>`count(*)` })
    .from(materials)
    .groupBy(materials.category)
    .orderBy(materials.category);
  return c.json(rows.map((r) => ({ name: r.name, count: Number(r.count) })));
});

// GET /materials/languages  -> daftar bahasa + jumlah
route.get("/languages", async (c) => {
  const rows = await db
    .select({ name: materials.language, count: sql<number>`count(*)` })
    .from(materials)
    .groupBy(materials.language)
    .orderBy(materials.language);
  return c.json(rows.map((r) => ({ name: r.name, count: Number(r.count) })));
});

// GET /materials/:id
route.get("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const material = await db.query.materials.findFirst({ where: eq(materials.id, id) });
  if (!material) throw notFound("Material tidak ditemukan");

  const progress = await db.query.userMaterialProgress.findFirst({
    where: and(
      eq(userMaterialProgress.materialId, id),
      eq(userMaterialProgress.userId, userId),
    ),
  });

  return c.json({ ...material, progress: progress?.progress ?? 0 });
});

// GET /materials/:id/recommended
route.get("/:id/recommended", async (c) => {
  const id = c.req.param("id");
  const material = await db.query.materials.findFirst({ where: eq(materials.id, id) });
  if (!material) throw notFound("Material tidak ditemukan");

  const recs = await db
    .select()
    .from(materials)
    .where(and(eq(materials.category, material.category), ne(materials.id, id)))
    .limit(3);
  return c.json(recs);
});

const progressSchema = z.object({
  progress: z.number().int().min(0).max(100),
  durationSeconds: z.number().int().min(0).optional(),
});

// PUT /materials/:id/progress
route.put("/:id/progress", zValidator("json", progressSchema), async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const { progress, durationSeconds = 0 } = c.req.valid("json");

  const material = await db.query.materials.findFirst({ where: eq(materials.id, id) });
  if (!material) throw notFound("Material tidak ditemukan");

  const completed = progress >= 100;
  const [row] = await db
    .insert(userMaterialProgress)
    .values({ userId, materialId: id, progress, completed, lastAccessedAt: new Date() })
    .onConflictDoUpdate({
      target: [userMaterialProgress.userId, userMaterialProgress.materialId],
      set: { progress, completed, lastAccessedAt: new Date() },
    })
    .returning();

  // Catat aktivitas (sekaligus update waktu belajar + streak) kalau ada waktu
  // belajar atau material baru saja diselesaikan.
  if (durationSeconds > 0 || completed) {
    await recordActivity(db, userId, {
      type: "material",
      referenceId: id,
      title: material.title,
      durationSeconds,
    });
  }

  return c.json(row);
});

export default route;
