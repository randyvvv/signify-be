import { and, desc, eq, ilike, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.js";
import {
  activities,
  materials,
  quizQuestions,
  quizzes,
  signPracticeAttempts,
  signPracticeSessions,
  userMaterialProgress,
  userPreferences,
  users,
  userVocabulary,
} from "../../db/schema.js";
import { todayStr } from "../activity.js";
import { normalizeWord } from "../sign-translate.js";
import { addVocabulary } from "../vocabulary.js";
import { extractVideoId, fetchTranscriptViaApi } from "../youtube.js";
import type { CoachCard, CoachTool, ToolContext, ToolResult } from "./types.js";

// Kategori kuis pribadi buatan Coach (tampil di daftar kuis milik user).
export const COACH_QUIZ_CATEGORY = "Signify Coach";
const MASTERED_INTERVAL = 21;
const MAX_TEXT = 5000;

/** Validasi argumen dari model; pesan error dikembalikan ke model agar bisa memperbaiki. */
function parseArgs<S extends z.ZodTypeAny>(schema: S, args: Record<string, unknown>): z.infer<S> {
  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "args"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid arguments — ${issues}`);
  }
  return parsed.data;
}

function clip(text: string, max = MAX_TEXT) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/* ------------------------------------------------------------------ */
/* Kuis isyarat (fungsi murni, dites)                                  */
/* ------------------------------------------------------------------ */

export interface SignQuizItem {
  term: string;
  distractors: string[];
}

export interface BuiltQuestion {
  term: string;
  options: string[];
  correctIndex: number;
}

function defaultShuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Susun soal "sign": avatar memperagakan `term`, user memilih arti dari 4 opsi.
 * Term duplikat dibuang; pengecoh yang kurang/duplikat diisi dari term lain.
 */
export function buildSignQuizQuestions(
  items: SignQuizItem[],
  shuffle: <T>(arr: T[]) => T[] = defaultShuffle,
): BuiltQuestion[] {
  const seen = new Set<string>();
  const clean = items
    .map((i) => ({ term: i.term.trim(), distractors: i.distractors.map((d) => d.trim()) }))
    .filter((i) => {
      const key = normalizeWord(i.term);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const allTerms = clean.map((i) => i.term);

  return clean.map((item) => {
    const used = new Set([normalizeWord(item.term)]);
    const wrong: string[] = [];
    for (const d of [...item.distractors, ...shuffle(allTerms)]) {
      const key = normalizeWord(d);
      if (!key || used.has(key)) continue;
      used.add(key);
      wrong.push(d);
      if (wrong.length === 3) break;
    }
    const options = shuffle([item.term, ...wrong]);
    return { term: item.term, options, correctIndex: options.indexOf(item.term) };
  });
}

/* ------------------------------------------------------------------ */
/* Tools                                                               */
/* ------------------------------------------------------------------ */

const getLearnerProfile: CoachTool = {
  name: "get_learner_profile",
  label: "Checking your progress",
  description:
    "Get the learner's real data: name, goals, streak, coins, learning time, sign language, vocabulary stats and weakest signs, sign-practice results with low-scoring words, materials in progress and recent activity. Call this first before giving personalised advice.",
  parameters: { type: "object", properties: {} },
  async run(ctx) {
    const uid = ctx.userId;
    const [user] = await db.select().from(users).where(eq(users.id, uid));
    const [prefs] = await db.select().from(userPreferences).where(eq(userPreferences.userId, uid));
    const today = todayStr();

    const [vocab] = await db
      .select({
        total: sql<number>`count(*)`,
        due: sql<number>`count(*) filter (where ${userVocabulary.dueDate} <= ${today})`,
        mastered: sql<number>`count(*) filter (where ${userVocabulary.intervalDays} >= ${MASTERED_INTERVAL})`,
      })
      .from(userVocabulary)
      .where(and(eq(userVocabulary.userId, uid), eq(userVocabulary.signedLanguage, ctx.signedLanguage)));
    const weakest = await db
      .select({ word: userVocabulary.word, lapses: userVocabulary.lapses })
      .from(userVocabulary)
      .where(and(eq(userVocabulary.userId, uid), eq(userVocabulary.signedLanguage, ctx.signedLanguage)))
      .orderBy(desc(userVocabulary.lapses), userVocabulary.ease)
      .limit(8);

    const [practice] = await db
      .select({
        sessions: sql<number>`count(*)`,
        avgAccuracy: sql<number>`coalesce(round(avg(${signPracticeSessions.accuracy})), 0)`,
      })
      .from(signPracticeSessions)
      .where(eq(signPracticeSessions.userId, uid));
    const lowScores = await db
      .select({ word: signPracticeAttempts.word, score: signPracticeAttempts.score })
      .from(signPracticeAttempts)
      .innerJoin(signPracticeSessions, eq(signPracticeSessions.id, signPracticeAttempts.sessionId))
      .where(and(eq(signPracticeSessions.userId, uid), lt(signPracticeAttempts.score, 60)))
      .orderBy(desc(signPracticeSessions.createdAt))
      .limit(10);

    const inProgress = await db
      .select({ id: materials.id, title: materials.title, progress: userMaterialProgress.progress })
      .from(userMaterialProgress)
      .innerJoin(materials, eq(materials.id, userMaterialProgress.materialId))
      .where(and(eq(userMaterialProgress.userId, uid), eq(userMaterialProgress.completed, false)))
      .orderBy(desc(userMaterialProgress.lastAccessedAt))
      .limit(5);
    const recent = await db
      .select({ type: activities.type, title: activities.title, at: activities.createdAt })
      .from(activities)
      .where(eq(activities.userId, uid))
      .orderBy(desc(activities.createdAt))
      .limit(5);

    const output = {
      name: user?.fullName ?? null,
      streakDays: user?.streakCount ?? 0,
      coins: user?.coins ?? 0,
      learningHours: +((user?.totalLearningSeconds ?? 0) / 3600).toFixed(1),
      signLanguage: ctx.signedLanguage,
      goals: prefs?.goals ?? [],
      focus: prefs?.masterFocus ?? null,
      frequency: prefs?.frequency ?? null,
      vocabulary: {
        total: Number(vocab?.total ?? 0),
        dueToday: Number(vocab?.due ?? 0),
        mastered: Number(vocab?.mastered ?? 0),
        weakest: weakest.filter((w) => w.lapses > 0).map((w) => w.word),
      },
      signPractice: {
        sessions: Number(practice?.sessions ?? 0),
        averageScore: Number(practice?.avgAccuracy ?? 0),
        lowScoringWords: [...new Set(lowScores.map((s) => s.word))],
      },
      materialsInProgress: inProgress,
      recentActivity: recent.map((r) => `${r.type}: ${r.title}`),
    };
    return {
      output,
      summary: `${output.streakDays}-day streak · ${output.vocabulary.total} signs · ${output.signPractice.sessions} practice sessions`,
    };
  },
};

const searchMaterials: CoachTool = {
  name: "search_materials",
  label: "Searching learning materials",
  description:
    "Search the Signify learning library. Returns materials (id, title, category, type, length, the learner's progress). Categories: K-12, Vocational, University, Career, Sign Language. Types: video, article, document.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Keywords to match in title/description" },
      category: { type: "string" },
      type: { type: "string", enum: ["video", "article", "document"] },
      limit: { type: "integer", minimum: 1, maximum: 10 },
    },
  },
  async run(ctx, args) {
    const a = parseArgs(
      z.object({
        query: z.string().optional(),
        category: z.string().optional(),
        type: z.enum(["video", "article", "document"]).optional(),
        limit: z.number().int().min(1).max(10).default(6),
      }),
      args,
    );
    const conditions = [];
    const words = (a.query ?? "").split(/\s+/).filter((w) => w.length > 2).slice(0, 5);
    if (words.length) {
      conditions.push(
        or(...words.flatMap((w) => [ilike(materials.title, `%${w}%`), ilike(materials.description, `%${w}%`)])),
      );
    }
    if (a.category) conditions.push(ilike(materials.category, a.category));
    if (a.type) conditions.push(eq(materials.type, a.type));

    const rows = await db
      .select({
        id: materials.id,
        title: materials.title,
        category: materials.category,
        type: materials.type,
        durationMinutes: materials.durationMinutes,
        pages: materials.pages,
        progress: sql<number>`coalesce(${userMaterialProgress.progress}, 0)`,
      })
      .from(materials)
      .leftJoin(
        userMaterialProgress,
        and(eq(userMaterialProgress.materialId, materials.id), eq(userMaterialProgress.userId, ctx.userId)),
      )
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(materials.createdAt))
      .limit(a.limit);

    return {
      output: { materials: rows },
      summary: rows.length ? `Found ${rows.length} material${rows.length === 1 ? "" : "s"}` : "No matching materials",
    };
  },
};

const getMaterialContent: CoachTool = {
  name: "get_material_content",
  label: "Reading a material",
  description:
    "Read the text of one learning material (article/document text or video transcript) to summarise it or extract vocabulary.",
  parameters: {
    type: "object",
    properties: { material_id: { type: "string" } },
    required: ["material_id"],
  },
  async run(_ctx, args) {
    const a = parseArgs(z.object({ material_id: z.string().uuid() }), args);
    const m = await db.query.materials.findFirst({ where: eq(materials.id, a.material_id) });
    if (!m) throw new Error("Material not found");
    const body = [...(m.content ?? []), ...(m.transcript ?? [])].join("\n\n");
    return {
      output: {
        id: m.id,
        title: m.title,
        type: m.type,
        category: m.category,
        description: m.description,
        text: clip(body || "(no text content)"),
      },
      summary: `Read “${m.title}”`,
    };
  },
};

const getVideoTranscript: CoachTool = {
  name: "get_video_transcript",
  label: "Fetching the video transcript",
  description:
    "Fetch the captions of a YouTube video the learner shared, to summarise it, extract key signs or build a quiz from it.",
  parameters: {
    type: "object",
    properties: { url: { type: "string", description: "YouTube URL or video id" } },
    required: ["url"],
  },
  async run(_ctx, args) {
    const a = parseArgs(z.object({ url: z.string().min(1) }), args);
    const videoId = extractVideoId(a.url);
    if (!videoId) throw new Error("Not a valid YouTube URL");
    const cues = await fetchTranscriptViaApi(videoId);
    if (cues.length === 0) throw new Error("This video has no captions");
    const text = cues.map((c) => c.text).join(" ");
    return {
      output: { videoId, text: clip(text), truncated: text.length > MAX_TEXT },
      summary: `Got ${cues.length} caption lines`,
    };
  },
};

const createSignQuiz: CoachTool = {
  name: "create_sign_quiz",
  label: "Creating a personal sign quiz",
  description:
    "Create a private quiz for this learner where the 3D avatar signs a word/short phrase and the learner picks its meaning from 4 options. Use short, signable terms (1–3 words). Provide 3 plausible wrong options per item.",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      level: { type: "string", enum: ["BEGINNER", "INTERMEDIATE", "EXPERT"] },
      items: {
        type: "array",
        minItems: 3,
        maxItems: 10,
        items: {
          type: "object",
          properties: {
            term: { type: "string" },
            distractors: { type: "array", items: { type: "string" } },
          },
          required: ["term", "distractors"],
        },
      },
    },
    required: ["title", "items"],
  },
  async run(ctx, args) {
    const a = parseArgs(
      z.object({
        title: z.string().min(3).max(80),
        description: z.string().max(200).optional(),
        level: z.enum(["BEGINNER", "INTERMEDIATE", "EXPERT"]).default("BEGINNER"),
        items: z
          .array(z.object({ term: z.string().min(1).max(60), distractors: z.array(z.string().max(60)).max(5) }))
          .min(3)
          .max(10),
      }),
      args,
    );
    const questions = buildSignQuizQuestions(a.items);
    if (questions.length < 3) throw new Error("Need at least 3 distinct terms");

    const quiz = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(quizzes)
        .values({
          title: a.title,
          description: a.description ?? "A personal sign quiz made for you by Signify Coach.",
          category: COACH_QUIZ_CATEGORY,
          level: a.level,
          rewardCoins: 30,
          thumbnailUrl: "/quizzes-thumb/quiz-sign-language.jpg",
          ownerId: ctx.userId,
        })
        .returning();
      await tx.insert(quizQuestions).values(
        questions.map((q, i) => ({
          quizId: created!.id,
          ordering: i + 1,
          type: "sign",
          question: "What does the avatar sign?",
          term: q.term,
          options: q.options,
          correctIndex: q.correctIndex,
        })),
      );
      return created!;
    });

    const card: CoachCard = {
      type: "quiz",
      quizId: quiz.id,
      title: quiz.title,
      level: quiz.level,
      questionCount: questions.length,
    };
    return {
      output: { quizId: quiz.id, questionCount: questions.length, terms: questions.map((q) => q.term) },
      summary: `Created “${quiz.title}” with ${questions.length} questions`,
      card,
    };
  },
};

const addSignsToVocabulary: CoachTool = {
  name: "add_signs_to_vocabulary",
  label: "Adding signs to My Signs",
  description:
    "Add words/short phrases to the learner's personal vocabulary (My Signs) so they are scheduled for spaced-repetition review.",
  parameters: {
    type: "object",
    properties: { words: { type: "array", items: { type: "string" }, maxItems: 15 } },
    required: ["words"],
  },
  async run(ctx, args) {
    const a = parseArgs(z.object({ words: z.array(z.string().min(1).max(60)).min(1).max(15) }), args);
    const added = await addVocabulary(db, ctx.userId, a.words, "coach", ctx.signedLanguage);
    const words = [...new Set(a.words.map(normalizeWord).filter(Boolean))];
    return {
      output: { added, alreadySaved: words.length - added },
      summary: `Added ${added} new sign${added === 1 ? "" : "s"}`,
      card: { type: "vocabulary", words, added },
    };
  },
};

const demonstrateSigns: CoachTool = {
  name: "demonstrate_signs",
  label: "Preparing the avatar",
  description:
    "Show the learner the 3D avatar signing a few key words or short phrases (max 6). The avatar plays them on the page.",
  parameters: {
    type: "object",
    properties: { phrases: { type: "array", items: { type: "string" }, maxItems: 6 } },
    required: ["phrases"],
  },
  async run(_ctx, args) {
    const a = parseArgs(z.object({ phrases: z.array(z.string().min(1).max(80)).min(1).max(6) }), args);
    const phrases = [...new Set(a.phrases.map((p) => p.trim()).filter(Boolean))];
    return {
      output: { shown: phrases.length },
      summary: `Ready to sign ${phrases.length} phrase${phrases.length === 1 ? "" : "s"}`,
      card: { type: "signs", phrases },
    };
  },
};

const recommendMaterials: CoachTool = {
  name: "recommend_materials",
  label: "Picking materials for you",
  description:
    "Show the learner a short list of recommended materials as clickable cards. Only use ids returned by search_materials or get_learner_profile.",
  parameters: {
    type: "object",
    properties: {
      material_ids: { type: "array", items: { type: "string" }, maxItems: 6 },
      note: { type: "string", description: "One short sentence on why these" },
    },
    required: ["material_ids"],
  },
  async run(ctx, args) {
    const a = parseArgs(
      z.object({ material_ids: z.array(z.string().uuid()).min(1).max(6), note: z.string().max(200).optional() }),
      args,
    );
    const rows = await db
      .select({
        id: materials.id,
        title: materials.title,
        category: materials.category,
        type: materials.type,
        thumbnailUrl: materials.thumbnailUrl,
        durationMinutes: materials.durationMinutes,
        pages: materials.pages,
        progress: sql<number>`coalesce(${userMaterialProgress.progress}, 0)`,
      })
      .from(materials)
      .leftJoin(
        userMaterialProgress,
        and(eq(userMaterialProgress.materialId, materials.id), eq(userMaterialProgress.userId, ctx.userId)),
      )
      .where(inArray(materials.id, a.material_ids));
    if (rows.length === 0) throw new Error("None of these material ids exist");
    const order = new Map(a.material_ids.map((id, i) => [id, i]));
    rows.sort((x, y) => (order.get(x.id) ?? 0) - (order.get(y.id) ?? 0));
    const items = rows.map((r) => ({ ...r, progress: Number(r.progress) }));
    return {
      output: { shown: items.map((i) => i.title) },
      summary: `Recommended ${items.length} material${items.length === 1 ? "" : "s"}`,
      card: { type: "materials", note: a.note, items },
    };
  },
};

const taskSchema = z.object({
  kind: z.enum(["material", "quiz", "practice", "review"]),
  label: z.string().min(1).max(120),
  material_id: z.string().uuid().optional(),
  quiz_id: z.string().uuid().optional(),
});

const showStudyPlan: CoachTool = {
  name: "show_study_plan",
  label: "Building your study plan",
  description:
    "Show a day-by-day study plan card. Each task is a material (with material_id), a quiz (with quiz_id), a sign practice session, or a My Signs review. Only use ids from earlier tool results.",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string" },
      summary: { type: "string" },
      days: {
        type: "array",
        maxItems: 7,
        items: {
          type: "object",
          properties: {
            day: { type: "integer" },
            title: { type: "string" },
            tasks: {
              type: "array",
              maxItems: 5,
              items: {
                type: "object",
                properties: {
                  kind: { type: "string", enum: ["material", "quiz", "practice", "review"] },
                  label: { type: "string" },
                  material_id: { type: "string" },
                  quiz_id: { type: "string" },
                },
                required: ["kind", "label"],
              },
            },
          },
          required: ["day", "title", "tasks"],
        },
      },
    },
    required: ["title", "days"],
  },
  async run(ctx, args) {
    const a = parseArgs(
      z.object({
        title: z.string().min(1).max(100),
        summary: z.string().max(300).optional(),
        days: z
          .array(
            z.object({
              day: z.number().int().min(1).max(31),
              title: z.string().min(1).max(100),
              tasks: z.array(taskSchema).min(1).max(5),
            }),
          )
          .min(1)
          .max(7),
      }),
      args,
    );

    // Hanya tautkan id yang benar-benar ada (materi) / terlihat user (kuis).
    const tasks = a.days.flatMap((d) => d.tasks);
    const materialIds = [...new Set(tasks.map((t) => t.material_id).filter((x): x is string => !!x))];
    const quizIds = [...new Set(tasks.map((t) => t.quiz_id).filter((x): x is string => !!x))];
    const validMaterials = new Set(
      materialIds.length
        ? (await db.select({ id: materials.id }).from(materials).where(inArray(materials.id, materialIds))).map((r) => r.id)
        : [],
    );
    const validQuizzes = new Set(
      quizIds.length
        ? (
            await db
              .select({ id: quizzes.id })
              .from(quizzes)
              .where(
                and(
                  inArray(quizzes.id, quizIds),
                  or(isNull(quizzes.ownerId), eq(quizzes.ownerId, ctx.userId)),
                ),
              )
          ).map((r) => r.id)
        : [],
    );

    const hrefFor = (t: z.infer<typeof taskSchema>) => {
      if (t.kind === "material" && t.material_id && validMaterials.has(t.material_id))
        return `/learning-materials/${t.material_id}`;
      if (t.kind === "quiz" && t.quiz_id && validQuizzes.has(t.quiz_id)) return `/quizzes/${t.quiz_id}`;
      if (t.kind === "quiz") return "/quizzes";
      if (t.kind === "practice") return "/sign-practice";
      if (t.kind === "review") return "/my-signs";
      return "/learning-materials";
    };

    const card: CoachCard = {
      type: "plan",
      title: a.title,
      summary: a.summary,
      days: a.days
        .sort((x, y) => x.day - y.day)
        .map((d) => ({
          day: d.day,
          title: d.title,
          tasks: d.tasks.map((t) => ({ kind: t.kind, label: t.label, href: hrefFor(t) })),
        })),
    };
    return {
      output: { shown: true, days: card.days.length },
      summary: `${card.days.length}-day plan ready`,
      card,
    };
  },
};

export const COACH_TOOLS: CoachTool[] = [
  getLearnerProfile,
  searchMaterials,
  getMaterialContent,
  getVideoTranscript,
  createSignQuiz,
  addSignsToVocabulary,
  demonstrateSigns,
  recommendMaterials,
  showStudyPlan,
];

export type { ToolContext, ToolResult };
