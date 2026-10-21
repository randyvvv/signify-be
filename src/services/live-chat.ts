import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { liveClassMessages, users } from "../db/schema.js";

/** Chat Kelas Live: pertanyaan dan komentar murid/guru, disimpan per kelas. */

export const MAX_CHAT_CHARS = 300;
export const RECENT_MESSAGES = 100;

export interface LiveChatMessageDto {
  id: string;
  userId: string;
  name: string | null;
  role: "teacher" | "student";
  text: string;
  at: string;
}

/** Satu baris teks rapi; null bila kosong atau terlalu panjang. */
export function normalizeChatText(text: string): string | null {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean || clean.length > MAX_CHAT_CHARS) return null;
  return clean;
}

/**
 * Batas kirim per pengguna supaya chat tidak dibanjiri: jeda minimal antarpesan
 * dan jumlah maksimal per menit.
 */
export class ChatRateLimiter {
  private readonly sent = new Map<string, number[]>();

  constructor(
    private readonly minGapMs = 800,
    private readonly perMinute = 20,
  ) {}

  allow(userId: string, now = Date.now()): boolean {
    const recent = (this.sent.get(userId) ?? []).filter((t) => now - t < 60_000);
    const last = recent.at(-1);
    if ((last !== undefined && now - last < this.minGapMs) || recent.length >= this.perMinute) {
      this.sent.set(userId, recent);
      return false;
    }
    recent.push(now);
    this.sent.set(userId, recent);
    return true;
  }
}

const roleOf = (userId: string, teacherId: string) => (userId === teacherId ? "teacher" : "student");

export async function listChatMessages(classId: string, teacherId: string, limit = RECENT_MESSAGES) {
  const rows = await db
    .select({
      id: liveClassMessages.id,
      userId: liveClassMessages.userId,
      name: users.fullName,
      text: liveClassMessages.text,
      createdAt: liveClassMessages.createdAt,
    })
    .from(liveClassMessages)
    .innerJoin(users, eq(users.id, liveClassMessages.userId))
    .where(eq(liveClassMessages.classId, classId))
    .orderBy(desc(liveClassMessages.createdAt))
    .limit(limit);
  return rows.reverse().map(
    (r): LiveChatMessageDto => ({
      id: r.id,
      userId: r.userId,
      name: r.name,
      role: roleOf(r.userId, teacherId),
      text: r.text,
      at: r.createdAt.toISOString(),
    }),
  );
}

export async function saveChatMessage(input: {
  classId: string;
  teacherId: string;
  userId: string;
  name: string | null;
  text: string;
}): Promise<LiveChatMessageDto> {
  const [row] = await db
    .insert(liveClassMessages)
    .values({ classId: input.classId, userId: input.userId, text: input.text })
    .returning();
  return {
    id: row!.id,
    userId: input.userId,
    name: input.name,
    role: roleOf(input.userId, input.teacherId),
    text: input.text,
    at: row!.createdAt.toISOString(),
  };
}

/**
 * Hapus satu pesan di kelas ini; true bila ada yang terhapus. `authorId` diisi
 * bila yang menghapus bukan guru (murid hanya boleh menghapus pesannya sendiri).
 */
export async function deleteChatMessage(classId: string, id: string, authorId?: string): Promise<boolean> {
  const conditions = [eq(liveClassMessages.id, id), eq(liveClassMessages.classId, classId)];
  if (authorId) conditions.push(eq(liveClassMessages.userId, authorId));
  const deleted = await db
    .delete(liveClassMessages)
    .where(and(...conditions))
    .returning({ id: liveClassMessages.id });
  return deleted.length > 0;
}
