import type { Content } from "@google/genai";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { agentMessages, agentSessions } from "../../db/schema.js";
import { env } from "../../lib/env.js";
import { getGeminiClient } from "../chat.js";
import { SIGN_LANGUAGES } from "../sign-translate.js";
import type { GenerateFn } from "./runner.js";
import type { CoachCard, CoachTool } from "./types.js";

const HISTORY_LIMIT = 12;

export function buildSystemInstruction(signedLanguage: string, today: string): string {
  const lang = SIGN_LANGUAGES.find((l) => l.code === signedLanguage)?.name ?? signedLanguage;
  return `You are Signify Coach, an AI learning agent inside Signify — a sign language learning platform with a 3D signing avatar.
Today is ${today}. The learner studies ${lang}.

How you work:
- You act, not just talk. Use tools to look at the learner's real data and to create things for them.
- For goals or "what should I do" questions, start with get_learner_profile, then search_materials, then create useful artifacts: show_study_plan, create_sign_quiz, add_signs_to_vocabulary, demonstrate_signs, recommend_materials.
- When the learner shares a YouTube link, use get_video_transcript, pick the key signable words, and offer a quiz/vocabulary from it.
- Never invent ids. Only use material_id / quiz_id values returned by tools.
- Quiz terms and demonstrated signs must be short (1–3 words) everyday words or phrases the avatar can sign.
- Don't call the same tool twice with the same arguments.

Final answer:
- Reply in the learner's language (Indonesian if they write Indonesian).
- Be warm, concise (max ~120 words), and refer to the cards you created ("I made you a quiz below").
- Use short markdown: **bold** and bullet lists only.`;
}

/** Adaptor Gemini (function calling) untuk runAgent. */
export function createGeminiGenerate(tools: CoachTool[], systemInstruction: string): GenerateFn {
  const client = getGeminiClient();
  const functionDeclarations = tools.map((t) => ({
    name: t.name,
    description: t.description,
    parametersJsonSchema: t.parameters,
  }));

  return async (contents) => {
    const response = await client.models.generateContent({
      model: env.GEMINI_MODEL,
      contents,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations }],
        temperature: 0.4,
        maxOutputTokens: 2048,
      },
    });
    const functionCalls = response.functionCalls;
    return {
      functionCalls,
      // `text` hanya dibaca bila tak ada function call (menghindari warning SDK).
      text: functionCalls?.length ? undefined : response.text,
      content: response.candidates?.[0]?.content,
    };
  };
}

/** Ringkas kartu jadi teks supaya model ingat apa yang sudah dibuat di giliran sebelumnya. */
export function describeCards(cards: CoachCard[]): string {
  return cards
    .map((c) => {
      switch (c.type) {
        case "quiz":
          return `[created quiz "${c.title}" (quiz_id ${c.quizId}, ${c.questionCount} questions)]`;
        case "plan":
          return `[showed study plan "${c.title}" (${c.days.length} days)]`;
        case "vocabulary":
          return `[added to My Signs: ${c.words.join(", ")}]`;
        case "signs":
          return `[avatar demonstrated: ${c.phrases.join(", ")}]`;
        case "materials":
          return `[recommended materials: ${c.items.map((i) => `${i.title} (${i.id})`).join(", ")}]`;
      }
    })
    .join("\n");
}

export async function getSession(userId: string, sessionId: string) {
  return db.query.agentSessions.findFirst({
    where: and(eq(agentSessions.id, sessionId), eq(agentSessions.userId, userId)),
  });
}

export async function createSession(userId: string, firstMessage: string) {
  const clean = firstMessage.replace(/\s+/g, " ").trim();
  const title = clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
  const [session] = await db.insert(agentSessions).values({ userId, title }).returning();
  return session!;
}

export async function listSessions(userId: string) {
  return db
    .select({ id: agentSessions.id, title: agentSessions.title, updatedAt: agentSessions.updatedAt })
    .from(agentSessions)
    .where(eq(agentSessions.userId, userId))
    .orderBy(desc(agentSessions.updatedAt))
    .limit(30);
}

export async function loadMessages(sessionId: string) {
  return db
    .select()
    .from(agentMessages)
    .where(eq(agentMessages.sessionId, sessionId))
    .orderBy(asc(agentMessages.createdAt));
}

/** Riwayat singkat untuk model (teks + ringkasan kartu). */
export async function loadHistory(sessionId: string): Promise<Content[]> {
  const rows = await db
    .select()
    .from(agentMessages)
    .where(eq(agentMessages.sessionId, sessionId))
    .orderBy(desc(agentMessages.createdAt))
    .limit(HISTORY_LIMIT);
  return rows.reverse().map((m) => {
    const cards = describeCards((m.cards ?? []) as CoachCard[]);
    return {
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: cards ? `${m.content}\n${cards}` : m.content }],
    };
  });
}

export async function saveMessage(input: {
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  steps?: unknown[];
  cards?: unknown[];
}) {
  await db.transaction(async (tx) => {
    await tx.insert(agentMessages).values({
      sessionId: input.sessionId,
      role: input.role,
      content: input.content,
      steps: input.steps ?? [],
      cards: input.cards ?? [],
    });
    await tx
      .update(agentSessions)
      .set({ updatedAt: new Date() })
      .where(eq(agentSessions.id, input.sessionId));
  });
}
