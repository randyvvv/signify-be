import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, ilike, sql, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  quizzes,
  quizQuestions,
  quizAttempts,
  quizAttemptAnswers,
  quizLikes,
} from "../db/schema.js";
import { badRequest, notFound } from "../lib/errors.js";
import { addCoins } from "../services/coins.js";
import { recordActivity } from "../services/activity.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";

const route = new Hono<{ Variables: AuthVariables }>();
route.use("*", requireAuth);

// GET /quizzes?search=&category=&level=
route.get("/", async (c) => {
  const search = c.req.query("search")?.trim();
  const category = c.req.query("category")?.trim();
  const level = c.req.query("level")?.trim();

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
  if (!quiz) throw notFound("Quiz tidak ditemukan");

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

// POST /quizzes/:id/attempts  -> grade, accuracy, +coins (transaksional)
route.post("/:id/attempts", zValidator("json", submitSchema), async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const { answers, timeTakenSeconds } = c.req.valid("json");

  const quiz = await db.query.quizzes.findFirst({ where: eq(quizzes.id, id) });
  if (!quiz) throw notFound("Quiz tidak ditemukan");

  const questions = await db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, id));
  const qById = new Map(questions.map((q) => [q.id, q]));

  // Tolak jawaban yang questionId-nya bukan milik quiz ini.
  const foreign = answers.find((a) => !qById.has(a.questionId));
  if (foreign) {
    throw badRequest(
      `Question ${foreign.questionId} bukan bagian dari quiz ini`,
      "invalid_question",
    );
  }

  // Grading + payload review (lengkap dengan jawaban benar untuk halaman hasil FE).
  let correctCount = 0;
  const graded = answers.map((a) => {
    const q = qById.get(a.questionId)!;
    const isCorrect = q.correctIndex === a.selectedIndex;
    if (isCorrect) correctCount++;
    return {
      questionId: a.questionId,
      question: q.question,
      type: q.type,
      term: q.term,
      selectedIndex: a.selectedIndex,
      correctIndex: q.correctIndex,
      isCorrect,
    };
  });

  const totalCount = questions.length;
  const accuracy = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
  const pointsEarned = Math.round((accuracy / 100) * quiz.rewardCoins);

  // Simpan attempt + jawaban, beri coins, dan catat aktivitas (+streak) — satu transaksi.
  const attempt = await db.transaction(async (tx) => {
    const [created] = await tx
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
      await tx.insert(quizAttemptAnswers).values(
        graded.map((g) => ({
          attemptId: created!.id,
          questionId: g.questionId,
          selectedIndex: g.selectedIndex,
          isCorrect: g.isCorrect,
        })),
      );
    }

    await addCoins(tx, userId, pointsEarned);
    await recordActivity(tx, userId, {
      type: "quiz",
      referenceId: id,
      title: quiz.title,
      durationSeconds: timeTakenSeconds,
    });

    return created!;
  });

  return c.json({ ...attempt, results: graded }, 201);
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

  const liked = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(quizLikes)
      .values({ userId, quizId: id })
      .onConflictDoNothing()
      .returning();
    if (inserted.length) {
      await tx
        .update(quizzes)
        .set({ likesCount: sql`${quizzes.likesCount} + 1` })
        .where(eq(quizzes.id, id));
    }
    return true;
  });

  return c.json({ liked });
});

// DELETE /quizzes/:id/like
route.delete("/:id/like", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(quizLikes)
      .where(and(eq(quizLikes.userId, userId), eq(quizLikes.quizId, id)))
      .returning();
    if (deleted.length) {
      await tx
        .update(quizzes)
        .set({ likesCount: sql`greatest(${quizzes.likesCount} - 1, 0)` })
        .where(eq(quizzes.id, id));
    }
  });

  return c.json({ liked: false });
});

export default route;
