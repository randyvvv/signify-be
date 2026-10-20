import { z } from "zod";
import { env } from "../lib/env.js";
import { generateWithRetry, minimalThinking } from "./chat.js";

/**
 * Role play dengan Signa: Signa memerankan tokoh dalam situasi sehari-hari,
 * pelajar menjawab dengan isyarat. Giliran Signa dibuat Gemini; bila Gemini
 * mati/gagal, skrip bawaan tiap skenario dipakai supaya latihan tetap jalan.
 */

export const ROLEPLAY_LANGUAGES = ["en", "id"] as const;
export type RolePlayLanguage = (typeof ROLEPLAY_LANGUAGES)[number];
type Localized = Record<RolePlayLanguage, string>;

interface ScriptReply {
  text: Localized;
  gloss: Localized;
}

interface ScriptStep {
  line: Localized;
  replies: ScriptReply[];
}

export interface Scenario {
  id: string;
  icon: "coffee" | "briefcase" | "users" | "stethoscope";
  title: Localized;
  description: Localized;
  // Untuk prompt Gemini (bahasa Inggris).
  signaRole: string;
  learnerRole: string;
  goal: string;
  /** Satu langkah per giliran pelajar; langkah pertama = pembuka. */
  steps: ScriptStep[];
  closing: Localized;
  summary: Localized;
}

const reply = (en: string, enGloss: string, id: string, idGloss: string): ScriptReply => ({
  text: { en, id },
  gloss: { en: enGloss, id: idGloss },
});

export const SCENARIOS: Scenario[] = [
  {
    id: "cafe",
    icon: "coffee",
    title: { en: "At the café", id: "Di kafe" },
    description: {
      en: "Order a drink from Signa the barista and pay for it.",
      id: "Pesan minuman ke Signa si barista, lalu bayar.",
    },
    signaRole: "a cheerful barista at a small café",
    learnerRole: "a customer ordering a drink",
    goal: "order a drink, choose hot or cold, decide on food and pay",
    steps: [
      {
        line: {
          en: "Hi, welcome! What would you like to drink today?",
          id: "Halo, selamat datang! Mau minum apa hari ini?",
        },
        replies: [
          reply("Coffee, please.", "COFFEE PLEASE", "Kopi satu, ya.", "KOPI SATU"),
          reply("Tea, please.", "TEA PLEASE", "Teh satu, ya.", "TEH SATU"),
          reply("Just water.", "WATER", "Air putih saja.", "AIR PUTIH"),
        ],
      },
      {
        line: { en: "Great choice! Hot or cold?", id: "Pilihan bagus! Mau panas atau dingin?" },
        replies: [
          reply("Hot, please.", "HOT PLEASE", "Panas, ya.", "PANAS"),
          reply("Cold, please.", "COLD PLEASE", "Dingin, ya.", "DINGIN"),
        ],
      },
      {
        line: {
          en: "Would you like something to eat too?",
          id: "Mau sekalian pesan makanan?",
        },
        replies: [
          reply("Yes, a cake.", "YES CAKE", "Iya, kue satu.", "IYA KUE"),
          reply("No, thank you.", "NO THANK YOU", "Tidak, terima kasih.", "TIDAK TERIMA KASIH"),
        ],
      },
      {
        line: {
          en: "That's 30 thousand rupiah. Cash or card?",
          id: "Totalnya 30 ribu rupiah. Tunai atau kartu?",
        },
        replies: [
          reply("Card, please.", "CARD", "Pakai kartu.", "KARTU"),
          reply("Cash.", "MONEY", "Tunai.", "UANG"),
        ],
      },
    ],
    closing: {
      en: "Here's your order. Enjoy, and see you again!",
      id: "Ini pesanannya. Selamat menikmati, sampai jumpa lagi!",
    },
    summary: {
      en: "You ordered a drink from start to finish and answered every question. Next time, try ending with THANK YOU.",
      id: "Kamu berhasil memesan minuman dari awal sampai bayar. Lain kali, coba tutup dengan TERIMA KASIH.",
    },
  },
  {
    id: "interview",
    icon: "briefcase",
    title: { en: "Job interview", id: "Wawancara kerja" },
    description: {
      en: "Introduce yourself and answer Signa's interview questions.",
      id: "Perkenalkan diri dan jawab pertanyaan wawancara dari Signa.",
    },
    signaRole: "a friendly HR interviewer at a technology company",
    learnerRole: "a job candidate",
    goal: "introduce yourself, talk about your experience and why you want the job",
    steps: [
      {
        line: {
          en: "Good morning, thanks for coming. Could you introduce yourself?",
          id: "Selamat pagi, terima kasih sudah datang. Boleh perkenalkan diri?",
        },
        replies: [
          reply("Hello, nice to meet you.", "HELLO NICE MEET", "Halo, senang bertemu.", "HALO SENANG BERTEMU"),
          reply("I am a student.", "I STUDENT", "Saya mahasiswa.", "SAYA MAHASISWA"),
        ],
      },
      {
        line: {
          en: "Nice to meet you too. Do you have any work experience?",
          id: "Senang bertemu juga. Kamu punya pengalaman kerja?",
        },
        replies: [
          reply("Yes, two years.", "YES TWO YEAR", "Ya, dua tahun.", "YA DUA TAHUN"),
          reply("No, but I learn fast.", "NO LEARN FAST", "Belum, tapi saya cepat belajar.", "BELUM BELAJAR CEPAT"),
        ],
      },
      {
        line: {
          en: "Why do you want to work with us?",
          id: "Kenapa kamu ingin bekerja di sini?",
        },
        replies: [
          reply("I like your team.", "LIKE TEAM", "Saya suka timnya.", "SUKA TIM"),
          reply("I want to grow.", "WANT GROW", "Saya ingin berkembang.", "INGIN BERKEMBANG"),
        ],
      },
      {
        line: {
          en: "Great answer. Do you have any questions for me?",
          id: "Jawaban yang bagus. Ada pertanyaan untuk saya?",
        },
        replies: [
          reply("When do I start?", "WHEN START", "Kapan saya mulai?", "KAPAN MULAI"),
          reply("No, thank you.", "NO THANK YOU", "Tidak, terima kasih.", "TIDAK TERIMA KASIH"),
        ],
      },
    ],
    closing: {
      en: "Thank you for your time. We will contact you soon. Good luck!",
      id: "Terima kasih atas waktunya. Kami akan segera menghubungi kamu. Semoga sukses!",
    },
    summary: {
      en: "You introduced yourself and answered every interview question. Keep practicing EXPERIENCE and TEAM so they flow smoothly.",
      id: "Kamu sudah memperkenalkan diri dan menjawab semua pertanyaan wawancara. Terus latih PENGALAMAN dan TIM supaya makin lancar.",
    },
  },
  {
    id: "classmate",
    icon: "users",
    title: { en: "New classmate", id: "Teman sekelas baru" },
    description: {
      en: "Get to know Signa, the new student in your class.",
      id: "Kenalan dengan Signa, murid baru di kelasmu.",
    },
    signaRole: "a friendly new student on their first day at school",
    learnerRole: "a student meeting the new classmate",
    goal: "greet each other, talk about favourite subjects and hobbies, and make plans",
    steps: [
      {
        line: { en: "Hi! I'm new here. What's your name?", id: "Hai! Aku anak baru. Nama kamu siapa?" },
        replies: [
          reply("Nice to meet you!", "NICE MEET YOU", "Senang kenalan!", "SENANG KENAL"),
          reply("Welcome to our class!", "WELCOME CLASS", "Selamat datang di kelas!", "SELAMAT DATANG KELAS"),
        ],
      },
      {
        line: {
          en: "Thanks! Which subject do you like the most?",
          id: "Makasih! Pelajaran apa yang paling kamu suka?",
        },
        replies: [
          reply("I like math.", "LIKE MATH", "Aku suka matematika.", "SUKA MATEMATIKA"),
          reply("I love art.", "LOVE ART", "Aku suka seni.", "SUKA SENI"),
        ],
      },
      {
        line: { en: "Cool! What do you do after school?", id: "Keren! Biasanya ngapain sepulang sekolah?" },
        replies: [
          reply("I play football.", "PLAY FOOTBALL", "Main bola.", "MAIN BOLA"),
          reply("I read books.", "READ BOOK", "Baca buku.", "BACA BUKU"),
        ],
      },
      {
        line: { en: "Fun! Want to have lunch together?", id: "Seru! Mau makan siang bareng?" },
        replies: [
          reply("Yes, let's go!", "YES GO", "Ayo!", "AYO"),
          reply("Sure, see you later.", "SEE YOU LATER", "Boleh, nanti ya.", "BOLEH NANTI"),
        ],
      },
    ],
    closing: {
      en: "Awesome, see you at lunch! I'm happy to have a new friend.",
      id: "Asyik, sampai ketemu pas makan siang! Senang punya teman baru.",
    },
    summary: {
      en: "You made a new friend and kept the conversation going. Try asking a question back next time, like WHAT YOU LIKE?",
      id: "Kamu dapat teman baru dan obrolannya terus berjalan. Lain kali coba balik bertanya, misalnya KAMU SUKA APA?",
    },
  },
  {
    id: "doctor",
    icon: "stethoscope",
    title: { en: "At the doctor", id: "Di dokter" },
    description: {
      en: "Tell Signa the doctor how you feel and understand the advice.",
      id: "Ceritakan keluhanmu ke Signa si dokter dan pahami sarannya.",
    },
    signaRole: "a calm, kind doctor at a clinic",
    learnerRole: "a patient who is not feeling well",
    goal: "explain your symptoms, say since when, and understand the doctor's advice",
    steps: [
      {
        line: {
          en: "Hello, please sit down. How are you feeling today?",
          id: "Halo, silakan duduk. Apa keluhannya hari ini?",
        },
        replies: [
          reply("I have a headache.", "HEADACHE", "Kepala saya sakit.", "KEPALA SAKIT"),
          reply("I feel sick.", "FEEL SICK", "Saya tidak enak badan.", "BADAN SAKIT"),
        ],
      },
      {
        line: { en: "I see. Since when?", id: "Baik. Sejak kapan?" },
        replies: [
          reply("Since yesterday.", "SINCE YESTERDAY", "Sejak kemarin.", "SEJAK KEMARIN"),
          reply("Two days ago.", "TWO DAY AGO", "Dua hari lalu.", "DUA HARI LALU"),
        ],
      },
      {
        line: { en: "Do you have a fever?", id: "Apakah kamu demam?" },
        replies: [
          reply("Yes, a little.", "YES LITTLE", "Iya, sedikit.", "IYA SEDIKIT"),
          reply("No.", "NO", "Tidak.", "TIDAK"),
        ],
      },
      {
        line: {
          en: "Please rest and drink a lot of water. Any questions?",
          id: "Istirahat dan banyak minum air, ya. Ada pertanyaan?",
        },
        replies: [
          reply("Do I need medicine?", "NEED MEDICINE", "Perlu obat?", "PERLU OBAT"),
          reply("No, thank you, doctor.", "NO THANK YOU", "Tidak, terima kasih, dokter.", "TIDAK TERIMA KASIH"),
        ],
      },
    ],
    closing: { en: "Here is your medicine. Get well soon!", id: "Ini obatnya. Semoga cepat sembuh!" },
    summary: {
      en: "You explained how you feel and answered the doctor's questions. Practice SINCE and MEDICINE for next time.",
      id: "Kamu sudah menjelaskan keluhan dan menjawab pertanyaan dokter. Latih lagi SEJAK dan OBAT untuk berikutnya.",
    },
  },
];

export function findScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

export interface RolePlayMessage {
  from: "signa" | "learner";
  text: string;
  /** Skor isyarat pelajar 0..100 (null = tidak direkam). */
  score?: number | null;
}

export interface RolePlayReply {
  text: string;
  /** 1-3 isyarat utama yang diperagakan (huruf besar). */
  gloss: string;
}

export interface RolePlayTurn {
  line: string;
  replies: RolePlayReply[];
  done: boolean;
  summary: string | null;
  source: "gemini" | "script";
}

const MAX_REPLIES = 3;
// Latensi Vertex kadang melonjak; lewat batas ini giliran memakai skrip supaya latihan tidak macet.
const TURN_TIMEOUT_MS = 12_000;
const MAX_GLOSS_WORDS = 3;

const learnerTurns = (history: RolePlayMessage[]) => history.filter((m) => m.from === "learner").length;

/** Giliran dari skrip skenario (pembuka, cadangan saat Gemini tidak tersedia). */
export function scriptTurn(scenario: Scenario, lang: RolePlayLanguage, turnsTaken: number): RolePlayTurn {
  const step = scenario.steps[turnsTaken];
  if (!step) {
    return { line: scenario.closing[lang], replies: [], done: true, summary: scenario.summary[lang], source: "script" };
  }
  return {
    line: step.line[lang],
    replies: step.replies.map((r) => ({ text: r.text[lang], gloss: r.gloss[lang] })),
    done: false,
    summary: null,
    source: "script",
  };
}

/** Rapikan gloss: huruf besar, tanpa tanda baca, paling banyak 3 isyarat. */
export function normalizeGloss(gloss: string): string {
  return gloss
    .toUpperCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_GLOSS_WORDS)
    .join(" ");
}

const LANGUAGE_NAMES: Record<RolePlayLanguage, string> = { en: "English", id: "Indonesian" };

function instruction(scenario: Scenario, lang: RolePlayLanguage, final: boolean) {
  const language = LANGUAGE_NAMES[lang];
  return `You are Signa, a friendly tutor in Signify, a sign language learning app. You are running a role play so the learner can practice a real conversation in sign language.
Scenario: ${scenario.title.en}. You play ${scenario.signaRole}. The learner plays ${scenario.learnerRole}. Goal: ${scenario.goal}.
Write everything in ${language}.

Each learner message is what they signed. A practice score from 0 to 100 may be attached; 60 or more means the sign was clear.
Reply in character with ONE short line (at most 25 words) that reacts to what the learner said and moves the conversation toward the goal. Use simple everyday words.
${
  final
    ? `This is the last turn: close the conversation politely in character, return an empty "replies" list, and write "summary": two short sentences telling the learner what they did well and one thing to practice next.
Respond with JSON only: {"line": "...", "replies": [], "summary": "..."}`
    : `Do not end the conversation yet. Suggest exactly ${MAX_REPLIES} different things the learner could answer next in "replies". Each has "text", a short natural reply (at most 6 words), and "gloss", the 1 to ${MAX_GLOSS_WORDS} key signs for it as uppercase ${language} words (for example "COFFEE PLEASE"), using only common words.
Respond with JSON only: {"line": "...", "replies": [{"text": "...", "gloss": "..."}]}`
}
Stay in character, keep it appropriate for students, and never mention being an AI model.`;
}

function transcript(history: RolePlayMessage[]) {
  return history
    .map((m) =>
      m.from === "signa"
        ? `Signa: ${m.text}`
        : `Learner${m.score != null ? ` (signed, score ${m.score})` : ""}: ${m.text}`,
    )
    .join("\n");
}

const geminiTurnSchema = z.object({
  line: z.string().trim().min(1).max(400),
  replies: z
    .array(z.object({ text: z.string().trim().min(1).max(120), gloss: z.string().trim().min(1).max(80) }))
    .max(6)
    .default([]),
  summary: z.string().trim().max(600).optional(),
});

/**
 * Validasi jawaban JSON Gemini. Saran balasan yang kosong diganti saran skrip
 * untuk giliran yang sama; giliran terakhir selalu tanpa saran dan dengan ringkasan.
 */
export function parseGeminiTurn(
  raw: string | undefined,
  scenario: Scenario,
  lang: RolePlayLanguage,
  turnsTaken: number,
): RolePlayTurn {
  const parsed = geminiTurnSchema.parse(JSON.parse(raw ?? ""));
  const final = turnsTaken >= scenario.steps.length;
  if (final) {
    return {
      line: parsed.line,
      replies: [],
      done: true,
      summary: parsed.summary || scenario.summary[lang],
      source: "gemini",
    };
  }
  const replies = parsed.replies
    .map((r) => ({ text: r.text, gloss: normalizeGloss(r.gloss) }))
    .filter((r) => r.gloss)
    .slice(0, MAX_REPLIES);
  return {
    line: parsed.line,
    replies: replies.length ? replies : scriptTurn(scenario, lang, turnsTaken).replies,
    done: false,
    summary: null,
    source: "gemini",
  };
}

/** Giliran Signa berikutnya. Pembuka selalu dari skrip supaya langsung tampil. */
export async function nextTurn(
  scenario: Scenario,
  lang: RolePlayLanguage,
  history: RolePlayMessage[],
): Promise<RolePlayTurn> {
  const turnsTaken = learnerTurns(history);
  if (history.length === 0 || !env.AI_ENABLED || !env.GEMINI_API_KEY) {
    return scriptTurn(scenario, lang, turnsTaken);
  }
  const final = turnsTaken >= scenario.steps.length;
  try {
    const response = await generateWithRetry({
      model: env.GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: `Conversation so far:\n${transcript(history)}\n\nWrite Signa's next turn.` }],
        },
      ],
      config: {
        systemInstruction: instruction(scenario, lang, final),
        temperature: 0.8,
        maxOutputTokens: 1024,
        // Tanpa responseJsonSchema: di Vertex schema membuat respons lambat sekali
        // (puluhan detik). Bentuk JSON ada di instruksi dan divalidasi parseGeminiTurn.
        responseMimeType: "application/json",
        thinkingConfig: minimalThinking(),
        httpOptions: { timeout: TURN_TIMEOUT_MS },
      },
    });
    return parseGeminiTurn(response.text, scenario, lang, turnsTaken);
  } catch (err) {
    console.error("[roleplay] gemini turn:", err instanceof Error ? err.message : err);
    return scriptTurn(scenario, lang, turnsTaken);
  }
}
