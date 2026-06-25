import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  date,
  timestamp,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Users (custom auth) + profil + stats gamifikasi                     */
/* ------------------------------------------------------------------ */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),

    // profil
    fullName: text("full_name"),
    gender: text("gender"), // 'male' | 'female' | null
    bio: text("bio"),
    avatarUrl: text("avatar_url"),

    // stats / gamifikasi
    coins: integer("coins").notNull().default(0),
    streakCount: integer("streak_count").notNull().default(0),
    lastActiveDate: date("last_active_date"),
    totalLearningSeconds: integer("total_learning_seconds").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

/* ------------------------------------------------------------------ */
/* Preferences (onboarding + settings)                                 */
/* ------------------------------------------------------------------ */
export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),

  // onboarding
  goals: jsonb("goals").$type<string[]>().notNull().default([]), // max 3
  masterFocus: text("master_focus"),
  frequency: text("frequency"), // casual | regular | intensive
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),

  // settings
  notifications: boolean("notifications").notNull().default(true),
  soundEffects: boolean("sound_effects").notNull().default(true),
  autoplay: boolean("autoplay").notNull().default(false),
  language: text("language").notNull().default("en"),

  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Learning materials                                                  */
/* ------------------------------------------------------------------ */
export const materials = pgTable(
  "materials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description"),
    thumbnailUrl: text("thumbnail_url"),
    type: text("type").notNull(), // video | document | article
    category: text("category").notNull(), // K-12 | Vocational | University | Career | Sign Language
    language: text("language").notNull().default("en"), // en | ja | ko | zh | id
    durationMinutes: integer("duration_minutes"),
    pages: integer("pages"),
    content: text("content"),
    articleUrl: text("article_url"),
    videoUrl: text("video_url"),
    transcript: jsonb("transcript").$type<string[]>(), // array paragraf
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("materials_category_idx").on(t.category),
    index("materials_language_idx").on(t.language),
  ],
);

export const userMaterialProgress = pgTable(
  "user_material_progress",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    progress: integer("progress").notNull().default(0), // 0..100
    completed: boolean("completed").notNull().default(false),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.materialId] })],
);

/* ------------------------------------------------------------------ */
/* Quizzes                                                             */
/* ------------------------------------------------------------------ */
export const quizzes = pgTable(
  "quizzes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description"),
    thumbnailUrl: text("thumbnail_url"),
    category: text("category").notNull(),
    level: text("level").notNull().default("BEGINNER"), // BEGINNER | INTERMEDIATE | EXPERT
    likesCount: integer("likes_count").notNull().default(0),
    rewardCoins: integer("reward_coins").notNull().default(50),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("quizzes_category_idx").on(t.category)],
);

export const quizQuestions = pgTable(
  "quiz_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    ordering: integer("ordering").notNull().default(0),
    type: text("type").notNull(), // text | image
    question: text("question").notNull(),
    promptImageUrl: text("prompt_image_url"), // utk type 'text': gambar isyarat
    term: text("term"), // utk type 'image': kata yang ditanyakan
    options: jsonb("options").$type<string[]>().notNull(), // teks atau url gambar
    correctIndex: integer("correct_index").notNull(),
  },
  (t) => [index("quiz_questions_quiz_idx").on(t.quizId)],
);

export const quizAttempts = pgTable(
  "quiz_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    correctCount: integer("correct_count").notNull().default(0),
    totalCount: integer("total_count").notNull().default(0),
    accuracy: integer("accuracy").notNull().default(0), // %
    pointsEarned: integer("points_earned").notNull().default(0),
    timeTakenSeconds: integer("time_taken_seconds").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("quiz_attempts_user_idx").on(t.userId)],
);

export const quizAttemptAnswers = pgTable("quiz_attempt_answers", {
  id: uuid("id").primaryKey().defaultRandom(),
  attemptId: uuid("attempt_id")
    .notNull()
    .references(() => quizAttempts.id, { onDelete: "cascade" }),
  questionId: uuid("question_id")
    .notNull()
    .references(() => quizQuestions.id, { onDelete: "cascade" }),
  selectedIndex: integer("selected_index").notNull(),
  isCorrect: boolean("is_correct").notNull(),
});

export const quizLikes = pgTable(
  "quiz_likes",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.quizId] })],
);

/* ------------------------------------------------------------------ */
/* Shop & avatar                                                       */
/* ------------------------------------------------------------------ */
export const shopItems = pgTable("shop_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  price: integer("price").notNull().default(0),
  category: text("category").notNull(), // Hair | Eye Color | Accessories | Background
  imageUrl: text("image_url"),
  color: text("color"),
  isDefault: boolean("is_default").notNull().default(false),
});

// Kepemilikan item: barisnya ada = dimiliki user.
export const userItems = pgTable(
  "user_items",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => shopItems.id, { onDelete: "cascade" }),
    equipped: boolean("equipped").notNull().default(false),
    acquiredAt: timestamp("acquired_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.itemId] })],
);

/* ------------------------------------------------------------------ */
/* Sign practice                                                       */
/* ------------------------------------------------------------------ */
export const signPracticeSessions = pgTable(
  "sign_practice_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: text("category").notNull(), // Sign Language Basics, Job Interview, dst
    goalWord: text("goal_word"), // mis. "WELCOME"
    completedCount: integer("completed_count").notNull().default(0),
    totalCount: integer("total_count").notNull().default(0),
    accuracy: integer("accuracy").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sign_practice_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------------ */
/* Activity feed (Recent Activity + sumber total learning)            */
/* ------------------------------------------------------------------ */
export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // material | quiz | practice
    referenceId: uuid("reference_id"),
    title: text("title").notNull(),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activities_user_idx").on(t.userId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Chatbot sessions + history                                          */
/* ------------------------------------------------------------------ */
export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("chat_sessions_user_material_unique").on(t.userId, t.materialId),
    index("chat_sessions_user_idx").on(t.userId, t.updatedAt),
  ],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chat_messages_session_idx").on(t.sessionId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Live translator sessions (AI — diisi worker saat model siap)        */
/* ------------------------------------------------------------------ */
export const translatorSessions = pgTable(
  "translator_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceUrl: text("source_url").notNull(),
    status: text("status").notNull().default("pending"), // pending | processing | done | error
    transcript: jsonb("transcript").$type<string[]>(), // diisi saat selesai
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("translator_sessions_user_idx").on(t.userId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Tipe bantu                                                          */
/* ------------------------------------------------------------------ */
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Material = typeof materials.$inferSelect;
export type Quiz = typeof quizzes.$inferSelect;
export type ShopItem = typeof shopItems.$inferSelect;
export type ChatSession = typeof chatSessions.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
