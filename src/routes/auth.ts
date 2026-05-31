import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, userPreferences } from "../db/schema.js";
import { hashPassword, verifyPassword, createToken } from "../lib/auth.js";
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
  const { email, password, fullName } = c.req.valid("json");

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existing) {
    return c.json({ error: "Email sudah terdaftar" }, 409);
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash, fullName })
    .returning();

  // Buat baris preferences default sekalian.
  await db.insert(userPreferences).values({ userId: user!.id });

  const token = await createToken(user!.id, user!.email);
  return c.json(
    {
      token,
      user: { id: user!.id, email: user!.email, fullName: user!.fullName },
    },
    201,
  );
});

auth.post("/login", zValidator("json", loginSchema), async (c) => {
  const { email, password } = c.req.valid("json");

  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return c.json({ error: "Email atau password salah" }, 401);
  }

  const token = await createToken(user.id, user.email);
  return c.json({
    token,
    user: { id: user.id, email: user.email, fullName: user.fullName },
  });
});

// Cek token cepat & dapatkan identitas dasar.
auth.get("/session", requireAuth, async (c) => {
  return c.json({ userId: c.get("userId"), email: c.get("email") });
});

export default auth;
