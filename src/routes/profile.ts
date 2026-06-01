import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, userPreferences, shopItems, userItems } from "../db/schema.js";
import { hashPassword, verifyPassword } from "../lib/auth.js";
import { publicUser } from "../lib/user.js";
import { badRequest, notFound, unauthorized } from "../lib/errors.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";

const profile = new Hono<{ Variables: AuthVariables }>();
profile.use("*", requireAuth);

// Hitung rank berdasarkan coins (jumlah user dengan coins lebih banyak + 1).
async function getRank(userId: string): Promise<number> {
  const me = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!me) return 0;
  const [row] = await db
    .select({ higher: sql<number>`count(*)` })
    .from(users)
    .where(sql`${users.coins} > ${me.coins}`);
  return Number(row?.higher ?? 0) + 1;
}

// GET /me  -> profil + stats
profile.get("/", async (c) => {
  const userId = c.get("userId");
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return c.json({ error: "User tidak ditemukan" }, 404);

  const rank = await getRank(userId);
  return c.json({
    ...publicUser(user),
    rank,
    totalLearningHours: +(user.totalLearningSeconds / 3600).toFixed(1),
  });
});

const updateProfileSchema = z.object({
  fullName: z.string().min(1).optional(),
  gender: z.enum(["male", "female"]).optional(),
  bio: z.string().optional(),
  avatarUrl: z.string().url().optional(),
});

// PATCH /me
profile.patch("/", zValidator("json", updateProfileSchema), async (c) => {
  const userId = c.get("userId");
  const data = c.req.valid("json");
  const [updated] = await db
    .update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return c.json(publicUser(updated!));
});

// GET /me/preferences
profile.get("/preferences", async (c) => {
  const userId = c.get("userId");
  let prefs = await db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, userId),
  });
  if (!prefs) {
    [prefs] = await db.insert(userPreferences).values({ userId }).returning();
  }
  return c.json(prefs);
});

const prefsSchema = z.object({
  goals: z.array(z.string()).max(3).optional(),
  masterFocus: z.string().optional(),
  frequency: z.enum(["casual", "regular", "intensive"]).optional(),
  onboardingCompleted: z.boolean().optional(),
  notifications: z.boolean().optional(),
  soundEffects: z.boolean().optional(),
  autoplay: z.boolean().optional(),
  language: z.string().optional(),
});

// PUT /me/preferences  (onboarding + settings)
profile.put("/preferences", zValidator("json", prefsSchema), async (c) => {
  const userId = c.get("userId");
  const data = c.req.valid("json");
  const [updated] = await db
    .update(userPreferences)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(userPreferences.userId, userId))
    .returning();
  if (!updated) {
    const [created] = await db
      .insert(userPreferences)
      .values({ userId, ...data })
      .returning();
    return c.json(created);
  }
  return c.json(updated);
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

// POST /me/password  -> ganti password
profile.post("/password", zValidator("json", passwordSchema), async (c) => {
  const userId = c.get("userId");
  const { currentPassword, newPassword } = c.req.valid("json");

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw notFound("User tidak ditemukan");

  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw unauthorized("Password lama salah", "invalid_password");
  }
  if (await verifyPassword(newPassword, user.passwordHash)) {
    throw badRequest("Password baru harus berbeda", "password_unchanged");
  }

  const passwordHash = await hashPassword(newPassword);
  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return c.json({ ok: true });
});

// GET /me/items  -> item yang dimiliki user (+ item default) & map yang dipakai
profile.get("/items", async (c) => {
  const userId = c.get("userId");

  const owned = await db
    .select({ item: shopItems, equipped: userItems.equipped })
    .from(userItems)
    .innerJoin(shopItems, eq(shopItems.id, userItems.itemId))
    .where(eq(userItems.userId, userId));
  const defaults = await db
    .select()
    .from(shopItems)
    .where(eq(shopItems.isDefault, true));

  // Gabung: item default selalu dianggap dimiliki; baris userItems menimpa status equipped.
  const byId = new Map<string, typeof shopItems.$inferSelect & { equipped: boolean }>();
  for (const d of defaults) byId.set(d.id, { ...d, equipped: false });
  for (const o of owned) byId.set(o.item.id, { ...o.item, equipped: o.equipped });

  const items = [...byId.values()];
  const equipped: Record<string, string> = {};
  for (const it of items) if (it.equipped) equipped[it.category] = it.id;

  return c.json({ items, equipped });
});

export default profile;
