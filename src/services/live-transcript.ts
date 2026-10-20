import { randomInt } from "node:crypto";

// Tanpa I/O/0/1 supaya kode mudah dibaca & diketik ulang dari layar proyektor.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CLASS_CODE_LENGTH = 6;

export function generateClassCode(random: (max: number) => number = randomInt): string {
  let code = "";
  for (let i = 0; i < CLASS_CODE_LENGTH; i++) code += CODE_ALPHABET[random(CODE_ALPHABET.length)];
  return code;
}

/** Kode kelas dari input user: huruf besar, tanpa spasi/tanda hubung. */
export function normalizeClassCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Bahasa lisan kelas -> kode BCP-47 untuk petunjuk bahasa transkripsi. */
export const SPOKEN_LANGUAGE_LOCALES: Record<string, string> = {
  en: "en-US",
  id: "id-ID",
};

// Batas panjang satu segmen (POST /api/translator/pose menerima maks. 500 karakter).
const MAX_SEGMENT_CHARS = 200;

/** Potong kalimat yang terlalu panjang di batas kata. */
function wrap(sentence: string): string[] {
  if (sentence.length <= MAX_SEGMENT_CHARS) return [sentence];
  const out: string[] = [];
  let cur = "";
  for (const word of sentence.split(" ")) {
    if (cur && cur.length + 1 + word.length > MAX_SEGMENT_CHARS) {
      out.push(cur);
      cur = word;
    } else {
      cur = cur ? `${cur} ${word}` : word;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Pecah teks jadi kalimat (setelah . ! ? … diikuti spasi); kalimat panjang dipotong. */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap(wrap);
}

export interface SegmentUpdate {
  /** Teks yang masih diucapkan (belum jadi segmen) untuk subtitle live. */
  partial: string;
  /** Kalimat yang baru final -> disimpan & dikirim ke avatar. */
  sentences: string[];
}

/**
 * Mengubah aliran transkripsi Gemini (interim kumulatif per ucapan + final saat
 * jeda bicara) menjadi kalimat final. Kalimat di tengah ucapan panjang dikirim
 * lebih awal bila sudah "tertutup" (ada teks sesudahnya) dan tidak berubah di
 * dua interim berturut-turut, karena tanda baca interim kadang masih berubah.
 */
export class TranscriptSegmenter {
  private emitted = 0;
  private previousClosed: string[] = [];
  private lastInterim = "";

  interim(text: string): SegmentUpdate {
    this.lastInterim = text;
    const sentences = splitSentences(text);
    const closed = sentences.slice(0, -1);
    const out: string[] = [];
    for (let i = this.emitted; i < closed.length; i++) {
      if (closed[i] !== this.previousClosed[i]) break;
      out.push(closed[i]!);
    }
    this.emitted += out.length;
    this.previousClosed = closed;
    return { partial: sentences.slice(this.emitted).join(" "), sentences: out };
  }

  final(text: string): SegmentUpdate {
    const sentences = splitSentences(text).slice(this.emitted);
    this.reset();
    return { partial: "", sentences };
  }

  /**
   * Sesi transkripsi putus sebelum final: sisa interim dianggap final supaya
   * kalimat terakhir tidak hilang.
   */
  flush(): SegmentUpdate {
    return this.lastInterim ? this.final(this.lastInterim) : { partial: "", sentences: [] };
  }

  private reset(): void {
    this.emitted = 0;
    this.previousClosed = [];
    this.lastInterim = "";
  }
}
