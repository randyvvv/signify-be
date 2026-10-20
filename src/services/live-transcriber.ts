import { Modality, type LiveServerMessage, type Session } from "@google/genai";
import { env } from "../lib/env.js";
import { getGeminiClient } from "./chat.js";

export interface TranscriberEvents {
  /** Teks sementara ucapan yang sedang berlangsung (kumulatif per ucapan). */
  onInterim(text: string): void;
  /** Teks final satu ucapan (dikirim Gemini saat pembicara jeda). */
  onFinal(text: string): void;
  /** Sesi putus sebelum ucapan final; transkrip sementara sebaiknya difinalkan. */
  onInterrupted(): void;
  /** Gagal tersambung berulang kali; siaran perlu dihentikan. */
  onFatal(message: string): void;
}

// Audio dari browser: PCM 16-bit mono 16 kHz.
const AUDIO_MIME = "audio/pcm;rate=16000";
// Audio yang ditahan selama menyambung ulang (5 detik).
const MAX_BUFFERED_BYTES = 16000 * 2 * 5;
const MAX_RECONNECT_ATTEMPTS = 5;
// Batas tunggu transkrip final setelah siaran dihentikan.
const FINAL_FLUSH_TIMEOUT_MS = 3000;
// Batas tunggu setupComplete dari Gemini setelah koneksi terbuka.
const SETUP_TIMEOUT_MS = 10_000;

// interimInputTranscription belum ada di tipe SDK 2.10.
type ServerContent = NonNullable<LiveServerMessage["serverContent"]> & {
  interimInputTranscription?: { text?: string };
};

/**
 * Satu aliran transkripsi Gemini Live untuk suara guru. Sesi Gemini punya batas
 * durasi, jadi bila putus di tengah siaran tersambung ulang otomatis; audio yang
 * masuk selama itu ditahan dulu (maks. 5 detik).
 */
/**
 * Nama model untuk Live API. Vertex dengan API key tidak tahu project-nya, jadi
 * modelnya harus ditulis lengkap (projects/<p>/locations/<l>/publishers/google/models/<m>).
 */
export function liveModelName(
  model: string,
  vertex: { enabled: boolean; project?: string; location: string },
): string {
  if (!vertex.enabled || !vertex.project || model.startsWith("projects/")) return model;
  return `projects/${vertex.project}/locations/${vertex.location}/publishers/google/models/${model}`;
}

export class GeminiTranscriber {
  private session: Session | null = null;
  private connecting: Promise<void> | null = null;
  private pending: Buffer[] = [];
  private pendingBytes = 0;
  private stopped = false;
  private failures = 0;
  // Pernah menerima setupComplete: model & key diterima Gemini.
  private everReady = false;
  private waitingFinal: (() => void) | null = null;
  private setupDone: (() => void) | null = null;
  private setupFailed: ((err: Error) => void) | null = null;

  constructor(
    private readonly opts: { languageCode?: string; events: TranscriberEvents },
  ) {}

  /** Buka sesi pertama; melempar error bila Gemini menolak (key/model salah). */
  async start(): Promise<void> {
    await this.connect();
  }

  sendAudio(pcm: Buffer): void {
    if (this.stopped) return;
    if (this.session) {
      this.send(this.session, pcm);
      return;
    }
    this.pending.push(pcm);
    this.pendingBytes += pcm.length;
    while (this.pendingBytes > MAX_BUFFERED_BYTES && this.pending.length > 1) {
      this.pendingBytes -= this.pending.shift()!.length;
    }
  }

  /** Hentikan siaran: tunggu transkrip final ucapan terakhir, lalu tutup sesi. */
  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    const session = this.session;
    this.session = null;
    if (!session) return;
    try {
      const gotFinal = new Promise<void>((resolve) => (this.waitingFinal = resolve));
      session.sendRealtimeInput({ audioStreamEnd: true });
      await Promise.race([gotFinal, new Promise((r) => setTimeout(r, FINAL_FLUSH_TIMEOUT_MS))]);
    } finally {
      this.waitingFinal = null;
      session.close();
    }
  }

  private send(session: Session, pcm: Buffer): void {
    session.sendRealtimeInput({ audio: { data: pcm.toString("base64"), mimeType: AUDIO_MIME } });
  }

  private connect(): Promise<void> {
    this.connecting ??= this.openSession().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private async openSession(): Promise<void> {
    const { languageCode } = this.opts;
    const holder: { session: Session | null } = { session: null };
    // Audio baru dikirim setelah setupComplete; yang terkirim sebelumnya bisa diabaikan Gemini.
    const setup = new Promise<void>((resolve, reject) => {
      this.setupDone = resolve;
      this.setupFailed = reject;
      setTimeout(() => reject(new Error("Gemini tidak mengirim setupComplete")), SETUP_TIMEOUT_MS);
    });
    const session = await getGeminiClient().live.connect({
      model: liveModelName(env.LIVE_TRANSCRIBE_MODEL, {
        enabled: env.GEMINI_VERTEX,
        project: env.VERTEX_PROJECT,
        location: env.VERTEX_LOCATION,
      }),
      config: {
        responseModalities: [Modality.TEXT],
        // Vertex masih memakai languageCodes; Gemini API (AI Studio) memakai languageHints.
        inputAudioTranscription: !languageCode
          ? {}
          : env.GEMINI_VERTEX
            ? { languageCodes: [languageCode] }
            : { languageHints: { languageCodes: [languageCode] } },
      },
      callbacks: {
        onmessage: (message) => this.onMessage(message),
        onerror: (event) => console.error("[live-transcriber] error:", event.message),
        onclose: (event) => this.onClose(holder.session, event.reason),
      },
    });
    holder.session = session;
    try {
      await setup;
    } catch (err) {
      session.close();
      throw err;
    } finally {
      this.setupDone = null;
      this.setupFailed = null;
    }
    if (this.stopped) {
      session.close();
      return;
    }
    this.session = session;
    for (const chunk of this.pending) this.send(session, chunk);
    this.pending = [];
    this.pendingBytes = 0;
  }

  private onMessage(message: LiveServerMessage): void {
    if (message.setupComplete) {
      this.failures = 0;
      this.everReady = true;
      this.setupDone?.();
    }
    const content = message.serverContent as ServerContent | undefined;
    const interim = content?.interimInputTranscription?.text;
    if (interim) this.opts.events.onInterim(interim);
    const final = content?.inputTranscription?.text;
    if (final) {
      this.opts.events.onFinal(final);
      this.waitingFinal?.();
    }
  }

  private onClose(closed: Session | null, reason: string): void {
    // Ditutup sebelum setupComplete (model/key/kuota ditolak): gagalkan pembukaan sesi.
    if (this.setupFailed && closed !== this.session) {
      this.setupFailed(new Error(reason || "Gemini menolak sesi transkripsi"));
      return;
    }
    // Penutupan sesi lama/disengaja tidak perlu disambung ulang.
    if (this.stopped || !closed || closed !== this.session) return;
    this.session = null;
    if (!this.everReady) {
      // Ditolak sejak awal (model/key/kuota): menyambung ulang tidak akan membantu.
      this.stopped = true;
      this.opts.events.onFatal(reason || "Gemini menolak sesi transkripsi");
      return;
    }
    this.opts.events.onInterrupted();
    void this.reconnect();
  }

  private async reconnect(): Promise<void> {
    while (!this.stopped && !this.session) {
      if (++this.failures > MAX_RECONNECT_ATTEMPTS) {
        this.stopped = true;
        this.opts.events.onFatal("Transkripsi terputus dan gagal tersambung ulang");
        return;
      }
      await new Promise((r) => setTimeout(r, 500 * this.failures));
      try {
        await this.connect();
      } catch (err) {
        console.error("[live-transcriber] reconnect gagal:", err instanceof Error ? err.message : err);
      }
    }
  }
}
