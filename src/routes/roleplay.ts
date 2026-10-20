import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { notFound } from "../lib/errors.js";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import { ROLEPLAY_LANGUAGES, SCENARIOS, findScenario, nextTurn } from "../services/roleplay.js";

const route = new Hono<{ Variables: AuthVariables }>();
route.use("*", requireAuth);

// GET /api/roleplay/scenarios — skenario role play (judul & deskripsi dalam en/id).
route.get("/scenarios", (c) =>
  c.json(
    SCENARIOS.map((s) => ({
      id: s.id,
      icon: s.icon,
      title: s.title,
      description: s.description,
      turns: s.steps.length,
    })),
  ),
);

const turnSchema = z.object({
  scenarioId: z.string().min(1).max(40),
  lang: z.enum(ROLEPLAY_LANGUAGES).default("en"),
  history: z
    .array(
      z.object({
        from: z.enum(["signa", "learner"]),
        text: z.string().trim().min(1).max(300),
        score: z.number().int().min(0).max(100).nullable().optional(),
      }),
    )
    .max(20)
    .default([]),
});

/**
 * POST /api/roleplay/turn — giliran Signa berikutnya: kalimat Signa, saran
 * balasan (teks + gloss isyarat), dan ringkasan di akhir. Riwayat dikirim klien
 * (tanpa sesi di server); skrip bawaan dipakai bila Gemini tidak tersedia.
 */
route.post("/turn", zValidator("json", turnSchema), async (c) => {
  const { scenarioId, lang, history } = c.req.valid("json");
  const scenario = findScenario(scenarioId);
  if (!scenario) throw notFound("Skenario tidak ditemukan", "scenario_not_found");
  return c.json(await nextTurn(scenario, lang, history));
});

export default route;
