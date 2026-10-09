import { env } from "./env.js";

/** Admin = email yang terdaftar di ADMIN_EMAILS (kamus isyarat, berita). */
export const isAdmin = (email: string) => env.ADMIN_EMAILS.includes(email.toLowerCase());
