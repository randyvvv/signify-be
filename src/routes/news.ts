import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { news } from "../db/schema.js";
import { isAdmin } from "../lib/admin.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { parsePagination, paginated } from "../lib/pagination.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import { slugify, toNewsDetail, toNewsSummary } from "../services/news.js";

// Baca berita = publik (landing page). Tulis/ubah/hapus = admin (ADMIN_EMAILS).
const route = new Hono<{ Variables: AuthVariables }>();

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// GET /news?category=&page=&limit=  -> berita yang sudah terbit, terbaru dulu
route.get("/", async (c) => {
  const category = c.req.query("category")?.trim();
  const exclude = c.req.query("exclude")?.trim(); // slug yang tidak ikut (mis. artikel yang sedang dibuka)
  const { page, limit, offset } = parsePagination(
    { page: c.req.query("page"), limit: c.req.query("limit") },
    { defaultLimit: 9, maxLimit: 30 },
  );

  const conditions = [eq(news.published, true)];
  if (category) conditions.push(eq(news.category, category));
  if (exclude) conditions.push(ne(news.slug, exclude));
  const where = and(...conditions);

  const [rows, [countRow]] = await Promise.all([
    db.select().from(news).where(where).orderBy(desc(news.publishedAt)).limit(limit).offset(offset),
    db.select({ total: sql<number>`count(*)` }).from(news).where(where),
  ]);

  return c.json(paginated(rows.map(toNewsSummary), page, limit, Number(countRow?.total ?? 0)));
});

// GET /news/:slug  -> detail berita yang sudah terbit
route.get("/:slug", async (c) => {
  const row = await db.query.news.findFirst({
    where: and(eq(news.slug, c.req.param("slug")), eq(news.published, true)),
  });
  if (!row) throw notFound("Berita tidak ditemukan");
  return c.json(toNewsDetail(row));
});

const factSchema = z.object({
  label: z.string().trim().min(1).max(60),
  value: z.string().trim().min(1).max(200),
  href: z.string().url().max(500).optional(),
});

const newsSchema = z.object({
  title: z.string().trim().min(3).max(200),
  slug: z.string().trim().max(120).regex(SLUG_RE, "Slug hanya huruf kecil, angka, dan tanda hubung").optional(),
  excerpt: z.string().trim().min(1).max(500),
  content: z.string().min(1).max(50_000),
  coverImageUrl: z.string().trim().max(500).nullable().optional(),
  category: z.string().trim().min(1).max(40).optional(),
  authorName: z.string().trim().min(1).max(80).optional(),
  facts: z.array(factSchema).max(12).optional(),
  published: z.boolean().optional(),
  publishedAt: z.string().datetime({ offset: true }).optional(),
});

const assertAdmin = (email: string) => {
  if (!isAdmin(email)) throw forbidden("Hanya admin yang bisa mengelola berita");
};

// id bukan UUID -> 404 (bukan error SQL "invalid input syntax for type uuid").
const newsId = (id: string) => {
  if (!z.string().uuid().safeParse(id).success) throw notFound("Berita tidak ditemukan");
  return id;
};

const assertSlugFree = async (slug: string, exceptId?: string) => {
  const taken = await db.query.news.findFirst({
    where: exceptId ? and(eq(news.slug, slug), ne(news.id, exceptId)) : eq(news.slug, slug),
    columns: { id: true },
  });
  if (taken) throw conflict("Slug sudah dipakai berita lain", "slug_taken");
};

// POST /news  -> buat berita (admin)
route.post("/", requireAuth, zValidator("json", newsSchema), async (c) => {
  assertAdmin(c.get("email"));
  const { publishedAt, ...body } = c.req.valid("json");

  const slug = body.slug ?? slugify(body.title);
  if (!slug) throw badRequest("Judul tidak bisa dijadikan slug", "invalid_slug");
  await assertSlugFree(slug);

  const [row] = await db
    .insert(news)
    .values({ ...body, slug, ...(publishedAt ? { publishedAt: new Date(publishedAt) } : {}) })
    .returning();
  return c.json(toNewsDetail(row!), 201);
});

// PATCH /news/:id  -> ubah sebagian field (admin)
route.patch("/:id", requireAuth, zValidator("json", newsSchema.partial()), async (c) => {
  assertAdmin(c.get("email"));
  const id = newsId(c.req.param("id"));
  const { publishedAt, ...body } = c.req.valid("json");
  if (body.slug) await assertSlugFree(body.slug, id);

  const [row] = await db
    .update(news)
    .set({
      ...body,
      ...(publishedAt ? { publishedAt: new Date(publishedAt) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(news.id, id))
    .returning();
  if (!row) throw notFound("Berita tidak ditemukan");
  return c.json(toNewsDetail(row));
});

// DELETE /news/:id (admin)
route.delete("/:id", requireAuth, async (c) => {
  assertAdmin(c.get("email"));
  const deleted = await db
    .delete(news)
    .where(eq(news.id, newsId(c.req.param("id"))))
    .returning({ id: news.id });
  if (!deleted.length) throw notFound("Berita tidak ditemukan");
  return c.json({ ok: true });
});

export default route;
