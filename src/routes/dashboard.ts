import { Hono } from "hono";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  users,
  materials,
  userMaterialProgress,
  quizzes,
  activities,
} from "../db/schema.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";

const route = new Hono<{ Variables: AuthVariables }>();
route.use("*", requireAuth);

const DAILY_GOAL_TARGET = 50; // target poin per hari

// GET /dashboard  -> semua data yang dibutuhkan halaman dashboard
route.get("/", async (c) => {
  const userId = c.get("userId");

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return c.json({ error: "User tidak ditemukan" }, 404);

  // rank by coins
  const [rankRow] = await db
    .select({ higher: sql<number>`count(*)` })
    .from(users)
    .where(sql`${users.coins} > ${user.coins}`);
  const rank = Number(rankRow?.higher ?? 0) + 1;

  // progres goal harian: total durasi aktivitas hari ini (detik) -> menit
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const [todayRow] = await db
    .select({ seconds: sql<number>`coalesce(sum(${activities.durationSeconds}), 0)` })
    .from(activities)
    .where(and(eq(activities.userId, userId), gte(activities.createdAt, startOfToday)));
  const dailyMinutes = Math.round(Number(todayRow?.seconds ?? 0) / 60);

  // recommended materials: yang belum selesai / belum dimulai
  const recommended = await db
    .select({ material: materials, progress: userMaterialProgress.progress })
    .from(materials)
    .leftJoin(
      userMaterialProgress,
      and(
        eq(userMaterialProgress.materialId, materials.id),
        eq(userMaterialProgress.userId, userId),
      ),
    )
    .limit(5);

  // recent activity
  const recentActivity = await db
    .select()
    .from(activities)
    .where(eq(activities.userId, userId))
    .orderBy(desc(activities.createdAt))
    .limit(10);

  // daily quiz: ambil satu quiz (paling populer)
  const [dailyQuiz] = await db
    .select()
    .from(quizzes)
    .orderBy(desc(quizzes.likesCount))
    .limit(1);

  return c.json({
    user: {
      id: user.id,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      coins: user.coins,
    },
    stats: {
      streak: user.streakCount,
      rank,
      totalLearningHours: +(user.totalLearningSeconds / 3600).toFixed(1),
      dailyGoal: {
        target: DAILY_GOAL_TARGET,
        current: dailyMinutes,
        percent: Math.min(100, Math.round((dailyMinutes / DAILY_GOAL_TARGET) * 100)),
      },
    },
    recommended: recommended.map((r) => ({ ...r.material, progress: r.progress ?? 0 })),
    recentActivity,
    dailyQuiz: dailyQuiz ?? null,
  });
});

export default route;
