import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { shopItems, userItems, users } from "../db/schema.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";

const route = new Hono<{ Variables: AuthVariables }>();
route.use("*", requireAuth);

// GET /shop/items?category=  -> item + status owned/equipped utk user
route.get("/items", async (c) => {
  const userId = c.get("userId");
  const category = c.req.query("category");

  const rows = await db
    .select({
      item: shopItems,
      owned: userItems.userId,
      equipped: userItems.equipped,
    })
    .from(shopItems)
    .leftJoin(
      userItems,
      and(eq(userItems.itemId, shopItems.id), eq(userItems.userId, userId)),
    )
    .where(category ? eq(shopItems.category, category) : undefined);

  return c.json(
    rows.map((r) => ({
      ...r.item,
      isOwned: r.owned !== null || r.item.isDefault,
      equipped: r.equipped ?? false,
    })),
  );
});

// POST /shop/items/:id/purchase  -> cek & potong coins
route.post("/items/:id/purchase", async (c) => {
  const userId = c.get("userId");
  const itemId = c.req.param("id");

  const item = await db.query.shopItems.findFirst({ where: eq(shopItems.id, itemId) });
  if (!item) return c.json({ error: "Item tidak ditemukan" }, 404);

  const already = await db.query.userItems.findFirst({
    where: and(eq(userItems.userId, userId), eq(userItems.itemId, itemId)),
  });
  if (already) return c.json({ error: "Item sudah dimiliki" }, 409);

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return c.json({ error: "User tidak ditemukan" }, 404);
  if (user.coins < item.price) {
    return c.json({ error: "Coins tidak cukup", needed: item.price - user.coins }, 400);
  }

  await db
    .update(users)
    .set({ coins: sql`${users.coins} - ${item.price}` })
    .where(eq(users.id, userId));
  await db.insert(userItems).values({ userId, itemId });

  const [updatedUser] = await db
    .select({ coins: users.coins })
    .from(users)
    .where(eq(users.id, userId));
  return c.json({ purchased: true, item, balance: updatedUser?.coins ?? 0 }, 201);
});

const equipSchema = z.object({
  // mapping kategori -> itemId yang dipakai (null = lepas)
  equipped: z.record(z.string(), z.string().uuid().nullable()),
});

// PUT /me/avatar  -> set item yang dipakai per kategori
route.put("/avatar", zValidator("json", equipSchema), async (c) => {
  const userId = c.get("userId");
  const { equipped } = c.req.valid("json");

  // reset semua equipped milik user dulu
  await db.update(userItems).set({ equipped: false }).where(eq(userItems.userId, userId));

  const ids = Object.values(equipped).filter((v): v is string => v !== null);
  for (const itemId of ids) {
    await db
      .update(userItems)
      .set({ equipped: true })
      .where(and(eq(userItems.userId, userId), eq(userItems.itemId, itemId)));
  }

  return c.json({ ok: true, equipped: ids });
});

export default route;
