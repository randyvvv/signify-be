import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { userVocabulary } from "../db/schema.js";
import { badRequest, notFound } from "../lib/errors.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import { recordActivity, todayStr } from "../services/activity.js";
import { addCoins } from "../services/coins.js";
import { normalizeWord } from "../services/sign-translate.js";
import { addVocabulary, getSignLanguage, schedule } from "../services/vocabulary.js";

const route = new Hono<{ Variables: AuthVariables }>();
route.use("*", requireAuth);

// Coins per kartu yang direview (maks per sesi review).
const COINS_PER_REVIEW = 1;
const MAX_REVIEW_COINS = 20;
// Interval (hari) di mana kata dianggap "dikuasai".
const MASTERED_INTERVAL = 21;

// GET /vocabulary  -> semua kosakata (bahasa isyarat aktif user) + statistik
route.get("/", async (c) => {
  const userId = c.get("userId");
  const lang = c.req.query("lang")?.trim() || (await getSignLanguage(db, userId));
  const today = todayStr();

  const items = await db
    .select()
    .from(userVocabulary)
    .where(and(eq(userVocabulary.userId, userId), eq(userVocabulary.signedLanguage, lang)))
    .orderBy(asc(userVocabulary.dueDate), asc(userVocabulary.word));

  const due = items.filter((i) => i.dueDate <= today).length;
  const mastered = items.filter((i) => i.intervalDays >= MASTERED_INTERVAL).length;
  return c.json({
    signedLanguage: lang,
    stats: { total: items.length, due, mastered, learning: items.length - mastered },
    items,
  });
});

// GET /vocabulary/due?limit=  -> kartu yang jatuh tempo untuk sesi review
route.get("/due", async (c) => {
  const userId = c.get("userId");
  const lang = await getSignLanguage(db, userId);
  const limit = Math.min(50, Math.max(1, Number(c.req.query("limit")) || 20));

  const rows = await db
    .select()
    .from(userVocabulary)
    .where(
      and(
        eq(userVocabulary.userId, userId),
        eq(userVocabulary.signedLanguage, lang),
        lte(userVocabulary.dueDate, todayStr()),
      ),
    )
    .orderBy(asc(userVocabulary.dueDate), sql`random()`)
    .limit(limit);
  return c.json(rows);
});

const addSchema = z.object({
  word: z.string().min(1).max(80),
  source: z.enum(["practice", "quiz", "translator", "manual"]).default("manual"),
});

// POST /vocabulary  -> simpan kata ke kamus pribadi
route.post("/", zValidator("json", addSchema), async (c) => {
  const userId = c.get("userId");
  const { word, source } = c.req.valid("json");
  const key = normalizeWord(word);
  if (!key) throw badRequest("Kata tidak valid", "invalid_word");

  const lang = await getSignLanguage(db, userId);
  await addVocabulary(db, userId, [key], source, lang);
  const row = await db.query.userVocabulary.findFirst({
    where: and(
      eq(userVocabulary.userId, userId),
      eq(userVocabulary.word, key),
      eq(userVocabulary.signedLanguage, lang),
    ),
  });
  return c.json(row, 201);
});

// DELETE /vocabulary/:id
route.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const deleted = await db
    .delete(userVocabulary)
    .where(and(eq(userVocabulary.id, c.req.param("id")), eq(userVocabulary.userId, userId)))
    .returning({ id: userVocabulary.id });
  if (!deleted.length) throw notFound("Kata tidak ditemukan");
  return c.json({ ok: true });
});

const reviewSchema = z.object({
  reviews: z
    .array(
      z.object({
        id: z.string().uuid(),
        rating: z.enum(["again", "hard", "good", "easy"]),
      }),
    )
    .min(1)
    .max(50),
  durationSeconds: z.number().int().min(0).default(0),
});

// POST /vocabulary/reviews  -> terapkan hasil satu sesi review (SM-2), +coins, +streak
route.post("/reviews", zValidator("json", reviewSchema), async (c) => {
  const userId = c.get("userId");
  const { reviews, durationSeconds } = c.req.valid("json");
  const today = todayStr();

  const result = await db.transaction(async (tx) => {
    const ids = [...new Set(reviews.map((r) => r.id))];
    const cards = await tx
      .select()
      .from(userVocabulary)
      .where(and(eq(userVocabulary.userId, userId), inArray(userVocabulary.id, ids)));
    const byId = new Map(cards.map((card) => [card.id, card]));

    const updated = [];
    for (const r of reviews) {
      const card = byId.get(r.id);
      if (!card) continue; // bukan milik user / sudah dihapus
      const next = schedule(card, r.rating, today);
      const [row] = await tx
        .update(userVocabulary)
        .set({ ...next, lastReviewedAt: new Date() })
        .where(eq(userVocabulary.id, card.id))
        .returning();
      byId.set(card.id, row!);
      updated.push(row!);
    }
    if (updated.length === 0) throw badRequest("Tidak ada kartu yang valid", "invalid_cards");

    const coinsEarned = Math.min(MAX_REVIEW_COINS, updated.length * COINS_PER_REVIEW);
    await addCoins(tx, userId, coinsEarned);
    await recordActivity(tx, userId, {
      type: "review",
      title: `Vocabulary Review: ${updated.length} signs`,
      durationSeconds,
    });
    return { updated, coinsEarned };
  });

  return c.json({ reviewed: result.updated.length, coinsEarned: result.coinsEarned, items: result.updated });
});

export default route;
