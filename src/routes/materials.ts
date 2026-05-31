import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, ilike, ne, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { materials, userMaterialProgress, users, activities } from "../db/schema.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";

const route = new Hono<{ Variables: AuthVariables }>();
route.use("*", requireAuth);

// GET /materials?search=&category=&language=&page=
route.get("/", async (c) => {
  const userId = c.get("userId");
  const search = c.req.query("search")?.trim();
  const category = c.req.query("category");
  const language = c.req.query("language");
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const limit = Math.min(50, Number(c.req.query("limit") ?? 12));

  const conditions = [];
  if (search) conditions.push(ilike(materials.title, `%${search}%`));
  if (category) conditions.push(eq(materials.category, category));
  if (language) conditions.push(eq(materials.language, language));

  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({
      material: materials,
      progress: userMaterialProgress.progress,
    })
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
    .offset((page - 1) * limit);

  return c.json({
    page,
    limit,
    items: rows.map((r) => ({ ...r.material, progress: r.progress ?? 0 })),
  });
});

// GET /materials/:id
route.get("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const material = await db.query.materials.findFirst({ where: eq(materials.id, id) });
  if (!material) return c.json({ error: "Material tidak ditemukan" }, 404);

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
  if (!material) return c.json({ error: "Material tidak ditemukan" }, 404);

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
  if (!material) return c.json({ error: "Material tidak ditemukan" }, 404);

  const completed = progress >= 100;
  const [row] = await db
    .insert(userMaterialProgress)
    .values({ userId, materialId: id, progress, completed, lastAccessedAt: new Date() })
    .onConflictDoUpdate({
      target: [userMaterialProgress.userId, userMaterialProgress.materialId],
      set: { progress, completed, lastAccessedAt: new Date() },
    })
    .returning();

  // Catat waktu belajar + aktivitas.
  if (durationSeconds > 0) {
    await db
      .update(users)
      .set({ totalLearningSeconds: sql`${users.totalLearningSeconds} + ${durationSeconds}` })
      .where(eq(users.id, userId));
    await db.insert(activities).values({
      userId,
      type: "material",
      referenceId: id,
      title: material.title,
      durationSeconds,
    });
  }

  return c.json(row);
});

export default route;
