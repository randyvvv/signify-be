import { Hono } from "hono";
import { desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";

const route = new Hono<{ Variables: AuthVariables }>();
route.use("*", requireAuth);

// GET /leaderboard?limit=
route.get("/", async (c) => {
  const limit = Math.min(100, Number(c.req.query("limit") ?? 20));
  const rows = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      avatarUrl: users.avatarUrl,
      coins: users.coins,
      streakCount: users.streakCount,
    })
    .from(users)
    .orderBy(desc(users.coins))
    .limit(limit);

  return c.json(
    rows.map((r, i) => ({ rank: i + 1, ...r })),
  );
});

export default route;
