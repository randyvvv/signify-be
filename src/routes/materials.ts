import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, ilike, ne, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { materials, userMaterialProgress } from "../db/schema.js";
import { parsePagination, paginated } from "../lib/pagination.js";
import { notFound } from "../lib/errors.js";
import { recordActivity } from "../services/activity.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";

const route = new Hono<{ Variables: AuthVariables }>();
route.use("*", requireAuth);

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
