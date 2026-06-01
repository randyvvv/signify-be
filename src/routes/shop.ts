import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { shopItems, userItems } from "../db/schema.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { spendCoins } from "../services/coins.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";

const route = new Hono<{ Variables: AuthVariables }>();
route.use("*", requireAuth);

// GET /shop/items?category=  -> item + status owned/equipped utk user
route.get("/items", async (c) => {
  const userId = c.get("userId");
  const category = c.req.query("category")?.trim();

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

// POST /shop/items/:id/purchase  -> potong coins atomik + tandai dimiliki
route.post("/items/:id/purchase", async (c) => {
  const userId = c.get("userId");
  const itemId = c.req.param("id");

  const item = await db.query.shopItems.findFirst({ where: eq(shopItems.id, itemId) });
  if (!item) throw notFound("Item tidak ditemukan");
  if (item.isDefault) throw conflict("Item default sudah dimiliki", "already_owned");

  const balance = await db.transaction(async (tx) => {
    const already = await tx
      .select({ u: userItems.userId })
      .from(userItems)
      .where(and(eq(userItems.userId, userId), eq(userItems.itemId, itemId)));
    if (already.length) throw conflict("Item sudah dimiliki", "already_owned");

    // spendCoins memotong saldo secara atomik & melempar kalau tidak cukup.
    const bal = await spendCoins(tx, userId, item.price);
    await tx.insert(userItems).values({ userId, itemId });
    return bal;
  });

  return c.json({ purchased: true, item, balance }, 201);
});

const equipSchema = z.object({
  // mapping kategori -> itemId yang dipakai (null = lepas)
  equipped: z.record(z.string(), z.string().uuid().nullable()),
});

// PUT /shop/avatar  -> set item yang dipakai per kategori
route.put("/avatar", zValidator("json", equipSchema), async (c) => {
  const userId = c.get("userId");
  const { equipped } = c.req.valid("json");

  const entries = Object.entries(equipped).filter(
    (e): e is [string, string] => e[1] !== null,
  );
  const ids = entries.map(([, id]) => id);

  await db.transaction(async (tx) => {
    if (ids.length) {
      const refItems = await tx
        .select()
        .from(shopItems)
        .where(inArray(shopItems.id, ids));
      const itemMap = new Map(refItems.map((i) => [i.id, i]));

      const ownedRows = await tx
        .select({ itemId: userItems.itemId })
        .from(userItems)
        .where(eq(userItems.userId, userId));
      const ownedSet = new Set(ownedRows.map((r) => r.itemId));

      // Validasi: item ada, kategori cocok, dan dimiliki (atau item default).
      for (const [category, itemId] of entries) {
        const item = itemMap.get(itemId);
        if (!item) throw badRequest(`Item ${itemId} tidak ditemukan`, "item_not_found");
        if (item.category !== category) {
          throw badRequest(
            `Item ${item.name} bukan kategori ${category}`,
            "category_mismatch",
          );
        }
        if (!ownedSet.has(itemId) && !item.isDefault) {
          throw badRequest(`Item ${item.name} belum dimiliki`, "not_owned");
        }
      }
    }

    // Lepas semua dulu, lalu pasang yang diminta (auto-own item default).
    await tx.update(userItems).set({ equipped: false }).where(eq(userItems.userId, userId));
    for (const itemId of ids) {
      await tx
        .insert(userItems)
        .values({ userId, itemId, equipped: true })
        .onConflictDoUpdate({
          target: [userItems.userId, userItems.itemId],
          set: { equipped: true },
        });
    }
  });

  return c.json({ ok: true, equipped: ids });
});

export default route;
