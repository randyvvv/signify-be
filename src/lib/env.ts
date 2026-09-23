import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} belum diset. Cek file .env`);
  }
  return value;
}

export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  JWT_SECRET: required("JWT_SECRET"),
  JWT_EXPIRES_IN: Number(process.env.JWT_EXPIRES_IN ?? 60 * 60 * 24 * 7), // 7 hari
  PORT: Number(process.env.PORT ?? 8787),
  CORS_ORIGIN: (process.env.CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim()),
  // Aktifkan fitur AI (chatbot/translator). Model belum ada, jadi default false.
  AI_ENABLED: process.env.AI_ENABLED === "true",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_MODEL: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  // Text -> .pose (dipakai avatar). Bahasa di luar SIGNGPT_LANGUAGES hanya
  // memakai kamus isyarat lokal (tabel sign_dictionary).
  SIGNGPT_URL: process.env.SIGNGPT_URL ?? "https://www.signgpt.org/api/translate-pose",
  SIGNGPT_LANGUAGES: list(process.env.SIGNGPT_LANGUAGES ?? "ase"),
  // Server inferensi signify-model (isyarat -> teks). Kosong = fitur nonaktif.
  SIGN_MODEL_URL: process.env.SIGN_MODEL_URL?.trim() || undefined,
  // Email yang boleh mengelola kamus isyarat.
  ADMIN_EMAILS: list(process.env.ADMIN_EMAILS ?? "").map((e) => e.toLowerCase()),
};

function list(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}
