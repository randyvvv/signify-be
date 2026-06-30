import { GoogleGenAI } from "@google/genai";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  chatMessages,
  chatSessions,
  type ChatMessage,
  type ChatSession,
  type Material,
} from "../db/schema.js";
import { env } from "../lib/env.js";
import { serviceUnavailable } from "../lib/errors.js";

export const MATERIAL_NO_CONTEXT_REPLY =
  "This material does not contain enough transcript or text content for me to answer from it yet.";

const SYSTEM_INSTRUCTION = `You are Signify, an educational assistant.

Answer only using the provided learning material context.
If the answer is not available in the material, say the material does not contain enough information.
Keep answers concise, beginner-friendly, and directly useful.`;

const SUMMARY_THRESHOLD = 20;
const RECENT_MESSAGE_LIMIT = 10;

let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!env.GEMINI_API_KEY) {
    throw serviceUnavailable(
      "GEMINI_API_KEY belum dikonfigurasi",
      "ai_unavailable",
    );
  }
  geminiClient ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return geminiClient;
}

function clean(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function listBlock(label: string, values: string[]): string | null {
  const content = values.map(clean).filter(Boolean).join("\n");
  return content ? `${label}:\n${content}` : null;
}

function pageBlock(label: string, values: string[] | null | undefined): string | null {
  const content = (values ?? [])
    .map(clean)
    .filter(Boolean)
    .map((page, index) => `Page ${index + 1}: ${page}`)
    .join("\n\n");
  return content ? `${label}:\n${content}` : null;
}

export interface MaterialAiContext {
  title: string;
  type: string;
  sourceText: string;
  hasUsableContent: boolean;
}

export function buildMaterialContext(material: Material): MaterialAiContext {
  const metadata = [
    `Title: ${material.title}`,
    `Type: ${material.type}`,
    `Category: ${material.category}`,
    `Language: ${material.language}`,
  ];
  if (material.description) metadata.push(`Description: ${material.description}`);

  const body: string[] = [];
  let hasUsableContent = false;

  if (material.type === "video") {
    if (material.videoUrl) body.push(`Video URL: ${material.videoUrl}`);
    const transcript = listBlock("Transcript", material.transcript ?? []);
    if (transcript) {
      body.push(transcript);
      hasUsableContent = true;
    }
  } else if (material.type === "document") {
    if (material.pages !== null) body.push(`Pages: ${material.pages}`);
    const content = pageBlock("Document content", material.content);
    if (content) {
      body.push(content);
      hasUsableContent = true;
    }
  } else if (material.type === "article") {
    if (material.articleUrl) body.push(`Article URL: ${material.articleUrl}`);
    const content = listBlock("Article content", material.content ?? []);
    if (content) {
      body.push(content);
      hasUsableContent = true;
    }
  }

  return {
    title: material.title,
    type: material.type,
    sourceText: [...metadata, ...body].join("\n\n"),
    hasUsableContent,
  };
}

export async function getOrCreateChatSession(
  userId: string,
  materialId: string,
): Promise<ChatSession> {
  const [session] = await db
    .insert(chatSessions)
    .values({ userId, materialId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [chatSessions.userId, chatSessions.materialId],
      set: { updatedAt: new Date() },
    })
    .returning();
  return session!;
}

export async function getExistingChatSession(
  userId: string,
  materialId: string,
): Promise<ChatSession | undefined> {
  return db.query.chatSessions.findFirst({
    where: and(eq(chatSessions.userId, userId), eq(chatSessions.materialId, materialId)),
  });
}

export type ChatRole = "user" | "assistant";

export interface ChatHistoryMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: Date;
}

function toHistoryMessage(message: ChatMessage): ChatHistoryMessage | null {
  if (message.role !== "user" && message.role !== "assistant") return null;
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
  };
}

export async function loadRecentMessages(
  sessionId: string,
  limit = RECENT_MESSAGE_LIMIT,
): Promise<ChatHistoryMessage[]> {
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);

  return rows.reverse().map(toHistoryMessage).filter((m): m is ChatHistoryMessage => m !== null);
}

export async function saveChatTurn(
  sessionId: string,
  userMessage: string,
  assistantReply: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(chatMessages).values([
      { sessionId, role: "user", content: userMessage },
      { sessionId, role: "assistant", content: assistantReply },
    ]);
    await tx
      .update(chatSessions)
      .set({ updatedAt: new Date() })
      .where(eq(chatSessions.id, sessionId));
  });
}

function formatHistory(messages: ChatHistoryMessage[]): string {
  if (messages.length === 0) return "No previous conversation.";
  return messages
    .map((m) => `${m.role === "user" ? "User" : "Signify"}: ${m.content}`)
    .join("\n");
}

function buildPrompt(input: {
  materialContext: MaterialAiContext;
  summary: string | null;
  recentMessages: ChatHistoryMessage[];
  message: string;
}): string {
  return `Learning material context:
${input.materialContext.sourceText}

Conversation summary:
${clean(input.summary) || "No summary yet."}

Recent conversation:
${formatHistory(input.recentMessages)}

User question:
${input.message}`;
}

export async function generateGroundedReply(input: {
  materialContext: MaterialAiContext;
  summary: string | null;
  recentMessages: ChatHistoryMessage[];
  message: string;
}): Promise<string> {
  if (!input.materialContext.hasUsableContent) return MATERIAL_NO_CONTEXT_REPLY;

  const client = getGeminiClient();
  const response = await client.models.generateContent({
    model: env.GEMINI_MODEL,
    contents: buildPrompt(input),
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.2,
      maxOutputTokens: 512,
    },
  });

  const reply = response.text?.trim();
  return reply || "I could not generate an answer from this material.";
}

export async function maybeSummarizeSession(sessionId: string): Promise<void> {
  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId));
  const count = Number(countRow?.count ?? 0);
  if (count < SUMMARY_THRESHOLD || count % 10 !== 0) return;

  const session = await db.query.chatSessions.findFirst({
    where: eq(chatSessions.id, sessionId),
  });
  if (!session) return;

  const messages = await loadRecentMessages(sessionId, 20);
  const client = getGeminiClient();
  const response = await client.models.generateContent({
    model: env.GEMINI_MODEL,
    contents: `Summarize this learning-material chat for future context. Keep only stable facts, user confusion, and useful learning progress.\n\n${formatHistory(messages)}`,
    config: { temperature: 0.1, maxOutputTokens: 256 },
  });

  const summary = response.text?.trim();
  if (!summary) return;
  await db
    .update(chatSessions)
    .set({
      summary: [session.summary, summary].map(clean).filter(Boolean).join("\n"),
      updatedAt: new Date(),
    })
    .where(eq(chatSessions.id, sessionId));
}
