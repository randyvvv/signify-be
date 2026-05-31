import { db } from "./index.js";
import { materials, quizzes, quizQuestions, shopItems } from "./schema.js";

/**
 * Seed data contoh agar endpoint langsung bisa dites.
 * Jalankan: pnpm db:seed
 */
async function seed() {
  console.log("Seeding...");

  // ---- Shop items (sesuai signify-fe/src/components/shop/data.ts) ----
  await db
    .insert(shopItems)
    .values([
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
    ])
    .onConflictDoNothing();

  // ---- Materials ----
  await db
    .insert(materials)
    .values([
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
    ])
    .onConflictDoNothing();

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

  console.log("Seed selesai ✅");
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
