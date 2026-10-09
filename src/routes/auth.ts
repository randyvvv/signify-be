import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, userPreferences } from "../db/schema.js";
import { hashPassword, verifyPassword, createToken } from "../lib/auth.js";
import { env } from "../lib/env.js";
import { verifyGoogleIdToken, type GoogleProfile } from "../lib/google.js";
import { publicUser, normalizeEmail } from "../lib/user.js";
import { conflict, serviceUnavailable, unauthorized } from "../lib/errors.js";
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

const googleSchema = z.object({
  // ID token (JWT) dari Google Identity Services di frontend.
  credential: z.string().min(1),
});

const GOOGLE_ONLY_MESSAGE = "Akun ini terdaftar lewat Google. Silakan masuk dengan Google.";

const auth = new Hono<{ Variables: AuthVariables }>();

auth.post("/register", zValidator("json", registerSchema), async (c) => {
  const { password, fullName } = c.req.valid("json");
  const email = normalizeEmail(c.req.valid("json").email);

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existing) {
    if (existing.passwordHash === null) throw conflict(GOOGLE_ONLY_MESSAGE, "google_account");
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
  if (user && user.passwordHash === null) throw unauthorized(GOOGLE_ONLY_MESSAGE, "google_account");
  if (!user || !(await verifyPassword(password, user.passwordHash!))) {
    throw unauthorized("Email atau password salah", "invalid_credentials");
  }

  const token = await createToken(user.id, user.email);
  return c.json({ token, user: publicUser(user) });
});

/**
 * Cari user untuk akun Google: lewat google_sub, lalu lewat email (akun email +
 * password yang sudah ada otomatis terhubung), atau buat user baru.
 */
async function findOrCreateGoogleUser(profile: GoogleProfile) {
  const bySub = await db.query.users.findFirst({ where: eq(users.googleSub, profile.sub) });
  if (bySub) return { user: bySub, isNewUser: false };

  const email = normalizeEmail(profile.email);
  const byEmail = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (byEmail) {
    // Email sama tapi sudah terhubung ke akun Google lain (mis. email Google pernah diganti).
    if (byEmail.googleSub) {
      throw conflict("Email ini sudah terhubung dengan akun Google lain", "google_account_mismatch");
    }
    const [linked] = await db
      .update(users)
      .set({
        googleSub: profile.sub,
        fullName: byEmail.fullName ?? profile.name ?? null,
        avatarUrl: byEmail.avatarUrl ?? profile.picture ?? null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, byEmail.id))
      .returning();
    return { user: linked!, isNewUser: false };
  }

  const [created] = await db
    .insert(users)
    .values({ email, googleSub: profile.sub, fullName: profile.name, avatarUrl: profile.picture })
    .onConflictDoNothing()
    .returning();
  if (!created) {
    // Login pertama yang bersamaan sudah membuat user ini lebih dulu.
    const existing = await db.query.users.findFirst({ where: eq(users.googleSub, profile.sub) });
    if (!existing) throw conflict("Email sudah terdaftar", "email_taken");
    return { user: existing, isNewUser: false };
  }
  await db.insert(userPreferences).values({ userId: created.id });
  return { user: created, isNewUser: true };
}

// "Sign in with Google": tukar ID token Google dengan JWT Signify.
auth.post("/google", zValidator("json", googleSchema), async (c) => {
  if (!env.GOOGLE_CLIENT_IDS.length) {
    throw serviceUnavailable("Login dengan Google belum dikonfigurasi", "google_disabled");
  }

  let profile: GoogleProfile;
  try {
    profile = await verifyGoogleIdToken(c.req.valid("json").credential, {
      audience: env.GOOGLE_CLIENT_IDS,
    });
  } catch {
    throw unauthorized("Login Google gagal, silakan coba lagi", "invalid_google_token");
  }

  const { user, isNewUser } = await findOrCreateGoogleUser(profile);
  const token = await createToken(user.id, user.email);
  return c.json({ token, user: publicUser(user), isNewUser }, isNewUser ? 201 : 200);
});

// Cek token cepat & dapatkan identitas dasar.
auth.get("/session", requireAuth, async (c) => {
  return c.json({ userId: c.get("userId"), email: c.get("email") });
});

export default auth;
