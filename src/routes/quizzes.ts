import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, ilike, sql, desc, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  quizzes,
  quizQuestions,
  quizAttempts,
  quizAttemptAnswers,
  quizLikes,
  users,
  activities,
} from "../db/schema.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";

const route = new Hono<{ Variables: AuthVariables }>();
route.use("*", requireAuth);

// GET /quizzes?search=&category=&level=
route.get("/", async (c) => {
  const search = c.req.query("search")?.trim();
  const category = c.req.query("category");
  const level = c.req.query("level");

  const conditions = [];
  if (search) conditions.push(ilike(quizzes.title, `%${search}%`));
  if (category) conditions.push(eq(quizzes.category, category));
  if (level) conditions.push(eq(quizzes.level, level));

  const rows = await db
    .select()
    .from(quizzes)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(quizzes.createdAt));
  return c.json(rows);
});

// GET /quizzes/popular
route.get("/popular", async (c) => {
  const rows = await db
    .select()
    .from(quizzes)
    .orderBy(desc(quizzes.likesCount))
    .limit(3);
  return c.json(rows);
});

// GET /quizzes/:id  (+ questions, tanpa membocorkan correctIndex)
route.get("/:id", async (c) => {
  const id = c.req.param("id");
  const quiz = await db.query.quizzes.findFirst({ where: eq(quizzes.id, id) });
  if (!quiz) return c.json({ error: "Quiz tidak ditemukan" }, 404);

  const questions = await db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, id))
    .orderBy(quizQuestions.ordering);

  return c.json({
    ...quiz,
    totalQuestions: questions.length,
    questions: questions.map(({ correctIndex, ...q }) => q),
  });
});

const submitSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string().uuid(),
      selectedIndex: z.number().int().min(0),
    }),
  ),
  timeTakenSeconds: z.number().int().min(0).default(0),
});

// POST /quizzes/:id/attempts  -> nilai, accuracy, +coins
route.post("/:id/attempts", zValidator("json", submitSchema), async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const { answers, timeTakenSeconds } = c.req.valid("json");

  const quiz = await db.query.quizzes.findFirst({ where: eq(quizzes.id, id) });
  if (!quiz) return c.json({ error: "Quiz tidak ditemukan" }, 404);

  const questions = await db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, id));
  const keyById = new Map(questions.map((q) => [q.id, q.correctIndex]));

  let correctCount = 0;
  const graded = answers.map((a) => {
    const isCorrect = keyById.get(a.questionId) === a.selectedIndex;
    if (isCorrect) correctCount++;
    return { ...a, isCorrect };
  });

  const totalCount = questions.length;
  const accuracy = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
  // Coins proporsional terhadap akurasi.
  const pointsEarned = Math.round((accuracy / 100) * quiz.rewardCoins);

  const [attempt] = await db
    .insert(quizAttempts)
    .values({
      userId,
      quizId: id,
      correctCount,
      totalCount,
      accuracy,
      pointsEarned,
      timeTakenSeconds,
    })
    .returning();

  if (graded.length) {
    await db.insert(quizAttemptAnswers).values(
      graded.map((g) => ({
        attemptId: attempt!.id,
        questionId: g.questionId,
        selectedIndex: g.selectedIndex,
        isCorrect: g.isCorrect,
      })),
    );
  }

  // Tambah coins + catat aktivitas.
  await db
    .update(users)
    .set({ coins: sql`${users.coins} + ${pointsEarned}` })
    .where(eq(users.id, userId));
  await db.insert(activities).values({
    userId,
    type: "quiz",
    referenceId: id,
    title: quiz.title,
    durationSeconds: timeTakenSeconds,
  });

  return c.json(
    { ...attempt, results: graded },
    201,
  );
});

// GET /quizzes/:id/attempts  (history user untuk quiz ini)
route.get("/:id/attempts", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const rows = await db
    .select()
    .from(quizAttempts)
    .where(and(eq(quizAttempts.quizId, id), eq(quizAttempts.userId, userId)))
    .orderBy(desc(quizAttempts.completedAt));
  return c.json(rows);
});

// POST /quizzes/:id/like
route.post("/:id/like", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const inserted = await db
    .insert(quizLikes)
    .values({ userId, quizId: id })
    .onConflictDoNothing()
    .returning();
  if (inserted.length) {
    await db
      .update(quizzes)
      .set({ likesCount: sql`${quizzes.likesCount} + 1` })
      .where(eq(quizzes.id, id));
  }
  return c.json({ liked: true });
});

// DELETE /quizzes/:id/like
route.delete("/:id/like", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const deleted = await db
    .delete(quizLikes)
    .where(and(eq(quizLikes.userId, userId), eq(quizLikes.quizId, id)))
    .returning();
  if (deleted.length) {
    await db
      .update(quizzes)
      .set({ likesCount: sql`greatest(${quizzes.likesCount} - 1, 0)` })
      .where(eq(quizzes.id, id));
  }
  return c.json({ liked: false });
});

export default route;
