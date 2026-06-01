import { sql, eq } from "drizzle-orm";
import { db } from "./index.js";
import {
  users,
  userPreferences,
  shopItems,
  materials,
  quizzes,
  quizQuestions,
} from "./schema.js";
import { hashPassword } from "../lib/auth.js";

const DEMO_EMAIL = "demo@signify.app";
const DEMO_PASSWORD = "password123";

/**
 * Seed data contoh. Idempoten: kalau sudah ada data, dilewati.
 * Jalankan ulang dari nol dengan: SEED_RESET=true pnpm db:seed
 */
async function seed() {
  const reset = process.env.SEED_RESET === "true";

  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(shopItems);
  const count = Number(rows[0]?.count ?? 0);

  if (count > 0 && !reset) {
    console.log(
      "Sudah ada data — seed dilewati. Pakai SEED_RESET=true untuk reset & seed ulang.",
    );
    process.exit(0);
  }

  if (reset) {
    console.log("SEED_RESET=true — menghapus data demo lama...");
    await db.delete(quizQuestions);
    await db.delete(quizzes);
    await db.delete(materials);
    await db.delete(shopItems);
  }

  console.log("Seeding...");

  // ---- Shop items (sesuai signify-fe/src/components/shop/data.ts) ----
  await db.insert(shopItems).values([
    { name: "Bun", price: 0, category: "Hair", isDefault: true },
    { name: "Braids", price: 200, category: "Hair" },
    { name: "Sideswept Bob", price: 200, category: "Hair" },
    { name: "Ponytail", price: 200, category: "Hair" },
    { name: "Brown", price: 0, category: "Eye Color", color: "#634e34", isDefault: true },
    { name: "Blue", price: 100, category: "Eye Color", color: "#2E5090" },
    { name: "Green", price: 100, category: "Eye Color", color: "#00BA6F" },
    { name: "Glasses", price: 150, category: "Accessories" },
    { name: "Hat", price: 150, category: "Accessories" },
    { name: "Studio", price: 0, category: "Background", color: "#f0f0f0", isDefault: true },
    { name: "Park", price: 300, category: "Background", color: "#c1e1c1" },
  ]);

  // ---- Materials ----
  await db.insert(materials).values([
    {
      title: "Basic Sign Language Greetings",
      description: "Belajar sapaan dasar dalam bahasa isyarat.",
      type: "video",
      category: "Sign Language",
      language: "en",
      durationMinutes: 8,
      videoUrl: "https://www.youtube.com/embed/v1desDduz5M",
      transcript: ["1. Halo dan selamat datang", "2. Cara memperkenalkan diri"],
    },
    {
      title: "Effective Presentation Techniques",
      description: "Teknik presentasi efektif.",
      type: "document",
      category: "Career",
      language: "en",
      pages: 11,
      content: "One hundred and nineteen public speaking students...",
    },
    {
      title: "Basic Mathematics: Linear Equations",
      type: "article",
      category: "K-12",
      language: "en",
      durationMinutes: 11,
      articleUrl: "https://www.tandfonline.com/doi/abs/10.1080/03634529409378958",
      content: "Pengantar persamaan linear...",
    },
  ]);

  // ---- Quiz + questions ----
  const [quiz] = await db
    .insert(quizzes)
    .values({
      title: "Scientific & Technical Terms",
      description: "Latih kosakata teknis lewat kuis singkat.",
      category: "Vocational",
      level: "BEGINNER",
      likesCount: 743,
      rewardCoins: 50,
    })
    .returning();

  if (quiz) {
    await db.insert(quizQuestions).values([
      {
        quizId: quiz.id,
        ordering: 1,
        type: "text",
        question: "What is the correct term for this sign?",
        promptImageUrl: "/quizzes/hand.png",
        options: ["Aljabar", "Kalkulus", "Trigonometri", "Geometri"],
        correctIndex: 0,
      },
      {
        quizId: quiz.id,
        ordering: 2,
        type: "image",
        question: "What is the correct sign for this term?",
        term: "Algebra",
        options: [
          "/learning-materials/avatar.png",
          "/learning-materials/avatar.png",
          "/learning-materials/avatar.png",
          "/learning-materials/avatar.png",
        ],
        correctIndex: 0,
      },
    ]);
  }

  // ---- Demo user (idempoten by email) ----
  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, DEMO_EMAIL),
  });
  if (!existingUser) {
    const [u] = await db
      .insert(users)
      .values({
        email: DEMO_EMAIL,
        passwordHash: await hashPassword(DEMO_PASSWORD),
        fullName: "Demo User",
        coins: 1000,
      })
      .returning();
    await db.insert(userPreferences).values({
      userId: u!.id,
      onboardingCompleted: true,
      frequency: "regular",
      goals: ["sign-lang"],
    });
    console.log(`Demo user dibuat: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  }

  console.log("Seed selesai ✅");
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
