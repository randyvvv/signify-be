import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { forbidden } from "./errors.js";

/** Pastikan user berperan guru (Kelas Live, materi buatan guru). Mengembalikan user-nya. */
export async function requireTeacher(userId: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (user?.role !== "teacher") {
    throw forbidden("Fitur ini khusus akun guru. Pilih peran guru di Settings.", "teacher_only");
  }
  return user;
}
