import { Hono } from "hono";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";

const route = new Hono<{ Variables: AuthVariables }>();
route.use("*", requireAuth);

const columns = {
  id: users.id,
  fullName: users.fullName,
  avatarUrl: users.avatarUrl,
  coins: users.coins,
  streakCount: users.streakCount,
};

// GET /leaderboard?limit=  -> top-N + posisi user saat ini
route.get("/", async (c) => {
  const userId = c.get("userId");
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit")) || 20));

  const top = await db
    .select(columns)
    .from(users)
    .orderBy(desc(users.coins))
    .limit(limit);
  const entries = top.map((r, i) => ({ rank: i + 1, ...r }));

  // Posisi user saat ini (walau di luar limit).
  const me = await db.query.users.findFirst({ where: eq(users.id, userId) });
  let meEntry = null;
  if (me) {
    const inTop = entries.find((e) => e.id === userId);
    if (inTop) {
      meEntry = inTop;
    } else {
      const [r] = await db
        .select({ higher: sql<number>`count(*)` })
        .from(users)
        .where(sql`${users.coins} > ${me.coins}`);
      meEntry = {
        rank: Number(r?.higher ?? 0) + 1,
        id: me.id,
        fullName: me.fullName,
        avatarUrl: me.avatarUrl,
        coins: me.coins,
        streakCount: me.streakCount,
      };
    }
  }

  return c.json({ entries, me: meEntry });
});

export default route;
