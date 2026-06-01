import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, sql, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { signPracticeSessions } from "../db/schema.js";
import { recordActivity } from "../services/activity.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";

const route = new Hono<{ Variables: AuthVariables }>();
route.use("*", requireAuth);

// Kategori skenario (statis, sesuai FE). Bisa dipindah ke tabel kalau perlu.
const CATEGORIES = [
  "Sign Language Basics",
  "School Presentations",
  "Job Interview",
  "Business Pitching",
];

// GET /sign-practice/categories
route.get("/categories", (c) => c.json(CATEGORIES));

const sessionSchema = z.object({
  category: z.string().min(1),
  goalWord: z.string().optional(),
  completedCount: z.number().int().min(0),
  totalCount: z.number().int().min(0),
  accuracy: z.number().int().min(0).max(100),
  durationSeconds: z.number().int().min(0).default(0),
});

// POST /sign-practice/sessions  -> simpan hasil latihan
route.post("/sessions", zValidator("json", sessionSchema), async (c) => {
  const userId = c.get("userId");
  const { durationSeconds, ...data } = c.req.valid("json");

  const session = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(signPracticeSessions)
      .values({ userId, ...data })
      .returning();

    await recordActivity(tx, userId, {
      type: "practice",
      referenceId: created!.id,
      title: `Sign Practice: ${data.category}`,
      durationSeconds,
    });

    return created!;
  });

  return c.json(session, 201);
});

// GET /sign-practice  -> agregat progress user
route.get("/", async (c) => {
  const userId = c.get("userId");
  const [agg] = await db
    .select({
      sessions: sql<number>`count(*)`,
      avgAccuracy: sql<number>`coalesce(round(avg(${signPracticeSessions.accuracy})), 0)`,
      totalCompleted: sql<number>`coalesce(sum(${signPracticeSessions.completedCount}), 0)`,
    })
    .from(signPracticeSessions)
    .where(eq(signPracticeSessions.userId, userId));

  const recent = await db
    .select()
    .from(signPracticeSessions)
    .where(eq(signPracticeSessions.userId, userId))
    .orderBy(desc(signPracticeSessions.createdAt))
    .limit(10);

  return c.json({
    sessions: Number(agg?.sessions ?? 0),
    avgAccuracy: Number(agg?.avgAccuracy ?? 0),
    totalCompleted: Number(agg?.totalCompleted ?? 0),
    recent,
  });
});

export default route;
