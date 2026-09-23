/** Kartu hasil yang dirender FE di bawah jawaban Signify Coach. */
export type CoachCard =
  | {
      type: "plan";
      title: string;
      summary?: string;
      days: {
        day: number;
        title: string;
        tasks: { kind: "material" | "quiz" | "practice" | "review"; label: string; href?: string }[];
      }[];
    }
  | { type: "quiz"; quizId: string; title: string; level: string; questionCount: number }
  | { type: "vocabulary"; words: string[]; added: number }
  | { type: "signs"; phrases: string[] }
  | {
      type: "materials";
      note?: string;
      items: {
        id: string;
        title: string;
        category: string;
        type: string;
        thumbnailUrl: string | null;
        durationMinutes: number | null;
        pages: number | null;
        progress: number;
      }[];
    };

/** Satu langkah tool yang dijalankan agent (ditampilkan sebagai timeline). */
export interface CoachStep {
  id: string;
  tool: string;
  label: string;
  status: "running" | "done" | "error";
  summary?: string;
}

/** Event yang di-stream ke FE lewat SSE. */
export type CoachEvent =
  | { type: "session"; sessionId: string; title: string }
  | { type: "step"; step: CoachStep }
  | { type: "card"; card: CoachCard }
  | { type: "message"; text: string }
  | { type: "error"; message: string }
  | { type: "done" };

export interface ToolContext {
  userId: string;
  signedLanguage: string;
}

export interface ToolResult {
  /** Data yang dikembalikan ke model (harus ringkas). */
  output: Record<string, unknown>;
  /** Ringkasan satu baris untuk timeline FE. */
  summary: string;
  card?: CoachCard;
}

export interface CoachTool {
  name: string;
  /** Label yang tampil di timeline saat tool berjalan. */
  label: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema object
  run: (ctx: ToolContext, args: Record<string, unknown>) => Promise<ToolResult>;
}
