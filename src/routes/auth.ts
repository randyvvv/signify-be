import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, userPreferences } from "../db/schema.js";
import { hashPassword, verifyPassword, createToken } from "../lib/auth.js";
import { publicUser, normalizeEmail } from "../lib/user.js";
import { conflict, unauthorized } from "../lib/errors.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(1).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const auth = new Hono<{ Variables: AuthVariables }>();

auth.post("/register", zValidator("json", registerSchema), async (c) => {
  const { password, fullName } = c.req.valid("json");
  const email = normalizeEmail(c.req.valid("json").email);

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existing) {
    throw conflict("Email sudah terdaftar", "email_taken");
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash, fullName })
    .returning();

  // Buat baris preferences default sekalian.
  await db.insert(userPreferences).values({ userId: user!.id });

  const token = await createToken(user!.id, user!.email);
  return c.json({ token, user: publicUser(user!) }, 201);
});

auth.post("/login", zValidator("json", loginSchema), async (c) => {
  const { password } = c.req.valid("json");
  const email = normalizeEmail(c.req.valid("json").email);

  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw unauthorized("Email atau password salah", "invalid_credentials");
  }

  const token = await createToken(user.id, user.email);
  return c.json({ token, user: publicUser(user) });
});

// Cek token cepat & dapatkan identitas dasar.
auth.get("/session", requireAuth, async (c) => {
  return c.json({ userId: c.get("userId"), email: c.get("email") });
});

export default auth;
