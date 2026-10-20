import type { WSContext } from "hono/ws";
import { asc, desc, eq, max } from "drizzle-orm";
import { db } from "../db/index.js";
import { liveClasses, liveClassSegments, users, type LiveClass } from "../db/schema.js";
import { env } from "../lib/env.js";
import { GeminiTranscriber } from "./live-transcriber.js";
import { SPOKEN_LANGUAGE_LOCALES, TranscriptSegmenter, type SegmentUpdate } from "./live-transcript.js";
import { translateTextToPose } from "./sign-translate.js";

const MAX_VIEWERS = 300;
const HEARTBEAT_MS = 25_000;
const PARTIAL_THROTTLE_MS = 150;
// Batas satu siaran supaya kredit Gemini tidak terkuras bila guru lupa menghentikan.
const MAX_BROADCAST_MS = 2 * 60 * 60 * 1000;
const RECENT_SEGMENTS = 100;
// Penyedia isyarat butuh beberapa detik per kalimat; disiapkan paralel supaya avatar tidak makin tertinggal.
const POSE_CONCURRENCY = 3;
// Ruang kosong dipertahankan sebentar (guru me-refresh halaman, penyimpanan segmen selesai).
const EMPTY_ROOM_TTL_MS = 60_000;

export type LiveStatus = "waiting" | "live" | "ended";
export type LiveRole = "teacher" | "student";

export interface LiveClassDto {
  id: string;
  code: string;
  title: string;
  spokenLanguage: string;
  signedLanguage: string;
  status: LiveStatus;
  teacherId: string;
  teacherName: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}

export interface LiveSegmentDto {
  seq: number;
  text: string;
  offsetMs: number;
}

export type LiveServerEvent =
  | {
      type: "ready";
      role: LiveRole;
      class: LiveClassDto;
      segments: LiveSegmentDto[];
      broadcasting: boolean;
      viewers: number;
    }
  | { type: "status"; status: LiveStatus; broadcasting: boolean }
  | { type: "partial"; text: string }
  | { type: "segment"; segment: LiveSegmentDto }
  | { type: "pose_ready"; seq: number; ok: boolean }
  | { type: "viewers"; count: number }
  | { type: "error"; message: string; code: string }
  | { type: "ping" };

export interface LiveClient {
  ws: WSContext;
  userId: string;
  role: LiveRole;
}

export function toLiveClassDto(cls: LiveClass, teacherName: string | null): LiveClassDto {
  return {
    id: cls.id,
    code: cls.code,
    title: cls.title,
    spokenLanguage: cls.spokenLanguage,
    signedLanguage: cls.signedLanguage,
    status: cls.status as LiveStatus,
    teacherId: cls.teacherId,
    teacherName,
    startedAt: cls.startedAt?.toISOString() ?? null,
    endedAt: cls.endedAt?.toISOString() ?? null,
    createdAt: cls.createdAt.toISOString(),
  };
}

export async function findLiveClassByCode(code: string) {
  const [row] = await db
    .select({ cls: liveClasses, teacherName: users.fullName })
    .from(liveClasses)
    .innerJoin(users, eq(users.id, liveClasses.teacherId))
    .where(eq(liveClasses.code, code));
  return row ?? null;
}

export async function listSegments(classId: string, limit?: number): Promise<LiveSegmentDto[]> {
  const columns = {
    seq: liveClassSegments.seq,
    text: liveClassSegments.text,
    offsetMs: liveClassSegments.offsetMs,
  };
  if (limit === undefined) {
    return db
      .select(columns)
      .from(liveClassSegments)
      .where(eq(liveClassSegments.classId, classId))
      .orderBy(asc(liveClassSegments.seq));
  }
  const latest = await db
    .select(columns)
    .from(liveClassSegments)
    .where(eq(liveClassSegments.classId, classId))
    .orderBy(desc(liveClassSegments.seq))
    .limit(limit);
  return latest.reverse();
}

function send(ws: WSContext, event: LiveServerEvent): void {
  if (ws.readyState !== 1) return;
  try {
    ws.send(JSON.stringify(event));
  } catch {
    // koneksi sedang ditutup
  }
}

/**
 * Satu kelas yang sedang dibuka: guru mengirim audio, server mentranskripsi
 * lewat Gemini Live, memecah per kalimat, menyiapkan pose isyaratnya (cache),
 * lalu menyiarkan subtitle + segmen ke semua murid.
 */
class LiveRoom {
  private readonly clients = new Set<LiveClient>();
  private teacher: LiveClient | null = null;
  private transcriber: GeminiTranscriber | null = null;
  private readonly segmenter = new TranscriptSegmenter();
  private writes: Promise<unknown> = Promise.resolve();
  private readonly poseQueue: LiveSegmentDto[] = [];
  private posesInFlight = 0;
  private readonly heartbeat: NodeJS.Timeout;
  private broadcastLimit: NodeJS.Timeout | null = null;
  private partialTimer: NodeJS.Timeout | null = null;
  private lastPartialAt = 0;
  private pendingPartial = "";
  private sentPartial = "";
  private emptyTimer: NodeJS.Timeout | null = null;

  constructor(
    private info: LiveClassDto,
    private nextSeq: number,
    private readonly onEmpty: (room: LiveRoom) => void,
  ) {
    this.heartbeat = setInterval(() => this.broadcast({ type: "ping" }), HEARTBEAT_MS);
    this.scheduleDestroy();
  }

  get classId(): string {
    return this.info.id;
  }

  get broadcasting(): boolean {
    return this.transcriber !== null;
  }

  get viewers(): number {
    let count = 0;
    for (const c of this.clients) if (c.role === "student") count++;
    return count;
  }

  async join(client: LiveClient): Promise<void> {
    if (this.emptyTimer) clearTimeout(this.emptyTimer);
    this.emptyTimer = null;
    if (client.role === "student" && this.viewers >= MAX_VIEWERS) {
      send(client.ws, { type: "error", message: "Kelas sudah penuh", code: "class_full" });
      client.ws.close(4429, "class full");
      return;
    }
    if (client.role === "teacher") {
      const previous = this.teacher;
      this.teacher = client;
      if (previous) {
        // Guru membuka kelas di tab/perangkat lain: koneksi lama ditutup.
        send(previous.ws, {
          type: "error",
          message: "Kelas dibuka di tab atau perangkat lain",
          code: "replaced",
        });
        this.clients.delete(previous);
        previous.ws.close(4409, "replaced");
        await this.stopBroadcast();
      }
    }
    this.clients.add(client);
    const segments = await listSegments(this.classId, RECENT_SEGMENTS).catch((err) => {
      console.error("[live-class] gagal memuat transkrip:", err);
      return [];
    });
    send(client.ws, {
      type: "ready",
      role: client.role,
      class: this.info,
      segments,
      broadcasting: this.broadcasting,
      viewers: this.viewers,
    });
    this.broadcast({ type: "viewers", count: this.viewers });
  }

  leave(client: LiveClient): void {
    if (!this.clients.delete(client)) return;
    if (this.teacher === client) {
      this.teacher = null;
      void this.stopBroadcast();
    }
    this.broadcast({ type: "viewers", count: this.viewers });
    if (this.clients.size === 0) this.scheduleDestroy();
  }

  async command(client: LiveClient, type: string): Promise<void> {
    if (client !== this.teacher) return;
    if (type === "start") await this.startBroadcast();
    else if (type === "stop") await this.stopBroadcast();
    else if (type === "end") await this.end();
  }

  audio(client: LiveClient, data: ArrayBuffer): void {
    if (client === this.teacher) this.transcriber?.sendAudio(Buffer.from(data));
  }

  async end(): Promise<void> {
    await this.stopBroadcast();
    if (this.info.status !== "ended") {
      const now = new Date();
      await db
        .update(liveClasses)
        .set({ status: "ended", endedAt: now, updatedAt: now })
        .where(eq(liveClasses.id, this.classId));
      this.info = { ...this.info, status: "ended", endedAt: now.toISOString() };
    }
    this.broadcastStatus();
  }

  private notifyTeacher(message: string, code: string): void {
    if (this.teacher) send(this.teacher.ws, { type: "error", message, code });
  }

  private async startBroadcast(): Promise<void> {
    if (this.transcriber) return;
    if (this.info.status === "ended") {
      this.notifyTeacher("Kelas ini sudah berakhir", "class_ended");
      return;
    }
    if (!env.AI_ENABLED || !env.GEMINI_API_KEY) {
      this.notifyTeacher("Transkripsi AI belum dikonfigurasi di server", "ai_unavailable");
      return;
    }

    const transcriber = new GeminiTranscriber({
      languageCode: SPOKEN_LANGUAGE_LOCALES[this.info.spokenLanguage],
      events: {
        onInterim: (text) => this.apply(this.segmenter.interim(text)),
        onFinal: (text) => this.apply(this.segmenter.final(text)),
        onInterrupted: () => this.apply(this.segmenter.flush()),
        onFatal: (message) => {
          if (this.transcriber === transcriber) this.transcriber = null;
          this.clearBroadcastLimit();
          this.apply(this.segmenter.flush());
          this.notifyTeacher(`Transkripsi berhenti: ${message}`, "transcriber_failed");
          this.broadcastStatus();
        },
      },
    });
    this.transcriber = transcriber;
    try {
      await transcriber.start();
    } catch (err) {
      this.transcriber = null;
      console.error("[live-class] gagal membuka transkripsi:", err instanceof Error ? err.message : err);
      this.notifyTeacher("Gagal memulai transkripsi, coba lagi", "transcriber_failed");
      return;
    }

    if (this.info.status !== "live") {
      const now = new Date();
      const startedAt = this.info.startedAt ? new Date(this.info.startedAt) : now;
      await db
        .update(liveClasses)
        .set({ status: "live", startedAt, updatedAt: now })
        .where(eq(liveClasses.id, this.classId));
      this.info = { ...this.info, status: "live", startedAt: startedAt.toISOString() };
    }
    this.broadcastLimit = setTimeout(() => {
      this.notifyTeacher("Siaran dihentikan otomatis setelah 2 jam", "time_limit");
      void this.stopBroadcast();
    }, MAX_BROADCAST_MS);
    this.broadcastStatus();
  }

  private async stopBroadcast(): Promise<void> {
    const transcriber = this.transcriber;
    if (!transcriber) return;
    this.transcriber = null;
    this.clearBroadcastLimit();
    this.broadcastStatus();
    // Transkrip final ucapan terakhir masih bisa datang lewat event selama stop().
    await transcriber.stop();
    this.apply(this.segmenter.flush());
  }

  private clearBroadcastLimit(): void {
    if (this.broadcastLimit) clearTimeout(this.broadcastLimit);
    this.broadcastLimit = null;
  }

  private apply(update: SegmentUpdate): void {
    for (const text of update.sentences) this.commitSegment(text);
    this.queuePartial(update.partial);
  }

  private commitSegment(text: string): void {
    const startedAt = this.info.startedAt ? Date.parse(this.info.startedAt) : Date.now();
    const segment: LiveSegmentDto = {
      seq: this.nextSeq++,
      text,
      offsetMs: Math.max(0, Date.now() - startedAt),
    };
    this.broadcast({ type: "segment", segment });
    this.writes = this.writes
      .then(() => db.insert(liveClassSegments).values({ classId: this.classId, ...segment }))
      .catch((err) => console.error("[live-class] gagal menyimpan segmen:", err));
    // Pose disiapkan di server (masuk pose_cache), murid tinggal mengambilnya.
    this.poseQueue.push(segment);
    this.pumpPoses();
  }

  private pumpPoses(): void {
    while (this.posesInFlight < POSE_CONCURRENCY && this.poseQueue.length > 0) {
      const segment = this.poseQueue.shift()!;
      this.posesInFlight++;
      void this.prepareSign(segment).finally(() => {
        this.posesInFlight--;
        this.pumpPoses();
      });
    }
  }

  private async prepareSign(segment: LiveSegmentDto): Promise<void> {
    let ok = false;
    try {
      const result = await translateTextToPose(
        segment.text,
        this.info.signedLanguage,
        this.info.spokenLanguage,
      );
      ok = result.clips.length > 0;
    } catch (err) {
      console.error("[live-class] gagal menyiapkan isyarat:", err instanceof Error ? err.message : err);
    }
    this.broadcast({ type: "pose_ready", seq: segment.seq, ok });
  }

  private queuePartial(text: string): void {
    this.pendingPartial = text;
    if (this.partialTimer) return;
    const wait = PARTIAL_THROTTLE_MS - (Date.now() - this.lastPartialAt);
    if (wait <= 0 || text === "") {
      this.flushPartial();
      return;
    }
    this.partialTimer = setTimeout(() => this.flushPartial(), wait);
  }

  private flushPartial(): void {
    if (this.partialTimer) clearTimeout(this.partialTimer);
    this.partialTimer = null;
    if (this.pendingPartial === this.sentPartial) return;
    this.sentPartial = this.pendingPartial;
    this.lastPartialAt = Date.now();
    this.broadcast({ type: "partial", text: this.pendingPartial });
  }

  private broadcastStatus(): void {
    this.broadcast({ type: "status", status: this.info.status, broadcasting: this.broadcasting });
  }

  private broadcast(event: LiveServerEvent): void {
    for (const client of this.clients) send(client.ws, event);
  }

  private scheduleDestroy(): void {
    if (this.emptyTimer) return;
    this.emptyTimer = setTimeout(() => {
      this.emptyTimer = null;
      if (this.clients.size === 0 && !this.broadcasting) this.destroy();
      else if (this.clients.size === 0) this.scheduleDestroy();
    }, EMPTY_ROOM_TTL_MS);
  }

  private destroy(): void {
    clearInterval(this.heartbeat);
    if (this.partialTimer) clearTimeout(this.partialTimer);
    this.clearBroadcastLimit();
    this.onEmpty(this);
  }
}

/** Ruang kelas aktif di proses ini (satu instance server). */
class LiveRoomRegistry {
  private readonly rooms = new Map<string, LiveRoom>();
  private readonly opening = new Map<string, Promise<LiveRoom>>();

  find(classId: string): LiveRoom | undefined {
    return this.rooms.get(classId);
  }

  async open(cls: LiveClass, teacherName: string | null): Promise<LiveRoom> {
    const existing = this.rooms.get(cls.id);
    if (existing) return existing;
    let opening = this.opening.get(cls.id);
    if (!opening) {
      opening = (async () => {
        const [row] = await db
          .select({ last: max(liveClassSegments.seq) })
          .from(liveClassSegments)
          .where(eq(liveClassSegments.classId, cls.id));
        const room = new LiveRoom(toLiveClassDto(cls, teacherName), (row?.last ?? -1) + 1, (r) => {
          if (this.rooms.get(r.classId) === r) this.rooms.delete(r.classId);
        });
        this.rooms.set(cls.id, room);
        return room;
      })().finally(() => this.opening.delete(cls.id));
      this.opening.set(cls.id, opening);
    }
    return opening;
  }
}

export const liveRooms = new LiveRoomRegistry();
