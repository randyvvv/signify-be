import type { users } from "../db/schema.js";

/**
 * Buang field sensitif (password_hash, google_sub) sebelum dikirim ke client.
 * `hasPassword` dipakai UI untuk menampilkan "Set password" pada akun Google.
 */
export function publicUser(u: typeof users.$inferSelect) {
  const { passwordHash, googleSub, ...rest } = u;
  return { ...rest, hasPassword: passwordHash !== null, googleLinked: googleSub !== null };
}

export type PublicUser = ReturnType<typeof publicUser>;

/** Samakan email: trim + lowercase, supaya unik & login konsisten. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
