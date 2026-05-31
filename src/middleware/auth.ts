import { createMiddleware } from "hono/factory";
import { verifyToken } from "../lib/auth.js";

export interface AuthVariables {
  userId: string;
  email: string;
}

/**
 * Middleware yang memaksa request membawa Bearer token valid.
 * Setelah lolos, userId & email tersedia lewat c.get("userId").
 */
export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const header = c.req.header("Authorization");
    if (!header || !header.startsWith("Bearer ")) {
      return c.json({ error: "Token tidak ada" }, 401);
    }
    const token = header.slice("Bearer ".length).trim();
    try {
      const payload = await verifyToken(token);
      c.set("userId", payload.sub);
      c.set("email", payload.email);
      await next();
    } catch {
      return c.json({ error: "Token tidak valid atau kadaluarsa" }, 401);
    }
  },
);
