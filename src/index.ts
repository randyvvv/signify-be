import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { swaggerUI } from "@hono/swagger-ui";
import { env } from "./lib/env.js";
import { openApiDocument } from "./openapi.js";
import { AppError } from "./lib/errors.js";

import auth from "./routes/auth.js";
import profile from "./routes/profile.js";
import materials from "./routes/materials.js";
import quizzes from "./routes/quizzes.js";
import shop from "./routes/shop.js";
import signPractice from "./routes/sign-practice.js";
import dashboard from "./routes/dashboard.js";
import leaderboard from "./routes/leaderboard.js";

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

app.get("/", (c) => c.json({ name: "signify-api", status: "ok", docs: "/docs" }));
app.get("/health", (c) => c.json({ status: "ok" }));

// API docs: raw OpenAPI spec + Swagger UI
app.get("/openapi.json", (c) => c.json(openApiDocument));
app.get("/docs", swaggerUI({ url: "/openapi.json" }));

const api = new Hono();
api.route("/auth", auth);
api.route("/me", profile);
api.route("/materials", materials);
api.route("/quizzes", quizzes);
api.route("/shop", shop);
api.route("/sign-practice", signPractice);
api.route("/dashboard", dashboard);
api.route("/leaderboard", leaderboard);

app.route("/api", api);

// 404 & error handler
app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.message, code: err.code }, err.status);
  }
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`🚀 signify-api jalan di http://localhost:${info.port}`);
});

export default app;
