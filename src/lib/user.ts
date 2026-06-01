import type { users } from "../db/schema.js";

/** Buang field sensitif (password_hash) sebelum dikirim ke client. */
export function publicUser(u: typeof users.$inferSelect) {
  const { passwordHash, ...rest } = u;
  return rest;
}

export type PublicUser = ReturnType<typeof publicUser>;

/** Samakan email: trim + lowercase, supaya unik & login konsisten. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
