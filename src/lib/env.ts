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
};
