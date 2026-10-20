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
  // Gemini lewat Vertex AI (memakai kredit Google Cloud) dengan API key yang terikat
  // service account. "false" = Gemini API di AI Studio.
  GEMINI_VERTEX: process.env.GEMINI_VERTEX?.trim() !== "false",
  // Project Google Cloud (ID atau nomor) & lokasi Vertex. Live API Vertex (transkripsi
  // Kelas Live) butuh nama model lengkap projects/.../locations/... saat memakai API key.
  VERTEX_PROJECT: process.env.VERTEX_PROJECT?.trim() || undefined,
  VERTEX_LOCATION: process.env.VERTEX_LOCATION?.trim() || "global",
  // Gemini 2.5 sudah tidak tersedia untuk project baru, jadi default ke seri 3.
  GEMINI_MODEL: process.env.GEMINI_MODEL ?? "gemini-3.5-flash",
  // Model Gemini Live untuk transkripsi suara guru di Kelas Live.
  LIVE_TRANSCRIBE_MODEL: process.env.LIVE_TRANSCRIBE_MODEL ?? "gemini-3.5-transcribe-live",
  // Model Gemini TTS untuk Isyarat -> Suara (kalimat dari isyarat dibacakan).
  TTS_MODEL: process.env.TTS_MODEL ?? "gemini-3.8-flash-tts",
  // Text -> .pose (dipakai avatar) lewat penyedia eksternal: "signmt" (default) atau
  // "signgpt". Bahasa di luar POSE_API_LANGUAGES hanya memakai kamus isyarat lokal
  // (tabel sign_dictionary).
  POSE_PROVIDER: (process.env.POSE_PROVIDER?.trim() === "signgpt" ? "signgpt" : "signmt") as
    | "signmt"
    | "signgpt",
  SIGN_MT_URL:
    process.env.SIGN_MT_URL ??
    "https://us-central1-sign-mt.cloudfunctions.net/spoken_text_to_signed_pose",
  SIGNGPT_URL: process.env.SIGNGPT_URL ?? "https://www.signgpt.org/api/translate-pose",
  // SIGNGPT_LANGUAGES = nama lama, tetap dibaca supaya .env lama tidak rusak.
  POSE_API_LANGUAGES: list(
    process.env.POSE_API_LANGUAGES ?? process.env.SIGNGPT_LANGUAGES ?? "ase",
  ),
  // Server inferensi signify-model (isyarat -> teks). Kosong = fitur nonaktif.
  SIGN_MODEL_URL: process.env.SIGN_MODEL_URL?.trim() || undefined,
  // Email yang boleh mengelola kamus isyarat.
  ADMIN_EMAILS: list(process.env.ADMIN_EMAILS ?? "").map((e) => e.toLowerCase()),
  // OAuth Client ID Google untuk "Sign in with Google" (boleh lebih dari satu,
  // dipisah koma). Kosong = POST /api/auth/google nonaktif.
  GOOGLE_CLIENT_IDS: list(process.env.GOOGLE_CLIENT_ID ?? ""),
  // LiveKit (video guru di Kelas Live). Kosong = Kelas Live tanpa video.
  LIVEKIT_URL: process.env.LIVEKIT_URL?.trim() || undefined,
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY?.trim() || undefined,
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET?.trim() || undefined,
};

function list(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}
