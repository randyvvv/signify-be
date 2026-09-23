import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, sql, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { signPracticeAttempts, signPracticeSessions } from "../db/schema.js";
import { recordActivity } from "../services/activity.js";
import { addCoins } from "../services/coins.js";
import { addVocabulary } from "../services/vocabulary.js";
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

// Skor minimal (0..100) agar satu kata dianggap berhasil, dan coins per kata berhasil.
export const PASS_SCORE = 60;
const COINS_PER_PASSED_WORD = 5;

const sessionSchema = z.object({
  category: z.string().min(1),
  goalWord: z.string().optional(),
  // Skor per kata dari pencocokan landmark di FE. Bila ada, agregat dihitung dari sini.
  attempts: z
    .array(
      z.object({
        word: z.string().min(1).max(80),
        score: z.number().int().min(0).max(100),
      }),
    )
    .max(100)
    .optional(),
  completedCount: z.number().int().min(0).default(0),
  totalCount: z.number().int().min(0).default(0),
  accuracy: z.number().int().min(0).max(100).default(0),
  durationSeconds: z.number().int().min(0).default(0),
});

// POST /sign-practice/sessions  -> simpan hasil latihan (+coins, +kosakata)
route.post("/sessions", zValidator("json", sessionSchema), async (c) => {
  const userId = c.get("userId");
  const { durationSeconds, attempts, ...data } = c.req.valid("json");

  const scored = (attempts ?? []).map((a) => ({ ...a, passed: a.score >= PASS_SCORE }));
  const passedCount = scored.filter((a) => a.passed).length;
  if (scored.length) {
    data.completedCount = scored.length;
    data.totalCount = Math.max(data.totalCount, scored.length);
    data.accuracy = Math.round(scored.reduce((sum, a) => sum + a.score, 0) / scored.length);
  }
  const pointsEarned = passedCount * COINS_PER_PASSED_WORD;

  const session = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(signPracticeSessions)
      .values({ userId, ...data, pointsEarned })
      .returning();

    if (scored.length) {
      await tx
        .insert(signPracticeAttempts)
        .values(scored.map((a) => ({ sessionId: created!.id, ...a })));
      await addVocabulary(tx, userId, scored.map((a) => a.word), "practice");
    }

    await addCoins(tx, userId, pointsEarned);
    await recordActivity(tx, userId, {
      type: "practice",
      referenceId: created!.id,
      title: `Sign Practice: ${data.category}`,
      durationSeconds,
    });

    return created!;
  });

  return c.json({ ...session, attempts: scored, passScore: PASS_SCORE }, 201);
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
