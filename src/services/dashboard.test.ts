import { test } from "node:test";
import assert from "node:assert/strict";
import type { Material } from "../db/schema.js";
import {
  getDailyQuizOffset,
  getUtcDayNumber,
  goalToCategories,
  masterFocusToCategories,
  rankRecommendedMaterials,
  scoreMaterialRecommendation,
  type MaterialRecommendationCandidate,
} from "./dashboard.js";

function material(overrides: Partial<Material>): Material {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    title: "Sample",
    description: null,
    thumbnailUrl: null,
    type: "article",
    category: "K-12",
    language: "en",
    durationMinutes: null,
    pages: null,
    content: null,
    articleUrl: null,
    videoUrl: null,
    transcript: null,
    createdAt: new Date("2026-06-01T00:00:00Z"),
    ...overrides,
  };
}

function candidate(
  overrides: Omit<Partial<MaterialRecommendationCandidate>, "material"> & {
    material?: Partial<Material>;
  },
): MaterialRecommendationCandidate {
  return {
    progress: 0,
    completed: false,
    ...overrides,
    material: material(overrides.material ?? {}),
  };
}

test("goal and master focus mappings match onboarding ids", () => {
  assert.deepEqual(goalToCategories("sign-lang"), ["Sign Language"]);
  assert.deepEqual(goalToCategories("higher-ed"), ["University"]);
  assert.deepEqual(masterFocusToCategories("academic"), ["K-12", "University"]);
  assert.deepEqual(masterFocusToCategories("explore"), []);
  assert.deepEqual(masterFocusToCategories(null), []);
});

test("scoreMaterialRecommendation applies preference, progress, and language boosts", () => {
  const score = scoreMaterialRecommendation(
    candidate({
      progress: 40,
      material: { category: "Sign Language", language: "en" },
    }),
    {
      goals: ["sign-lang"],
      masterFocus: "sign-master",
      language: "en",
    },
  );

  assert.equal(score, 115);
});

test("rankRecommendedMaterials excludes completed materials", () => {
  const ranked = rankRecommendedMaterials(
    [
      candidate({
        progress: 100,
        material: { id: "00000000-0000-0000-0000-000000000001", title: "Done" },
      }),
      candidate({
        completed: true,
        material: {
          id: "00000000-0000-0000-0000-000000000002",
          title: "Also Done",
        },
      }),
      candidate({
        progress: 90,
        material: {
          id: "00000000-0000-0000-0000-000000000003",
          title: "Continue",
        },
      }),
    ],
    { goals: [] },
  );

  assert.deepEqual(
    ranked.map((item) => item.material.title),
    ["Continue"],
  );
});

test("rankRecommendedMaterials puts in-progress preferred material first", () => {
  const ranked = rankRecommendedMaterials(
    [
      candidate({
        progress: 0,
        material: {
          id: "00000000-0000-0000-0000-000000000001",
          title: "Unrelated New",
          category: "Career",
          createdAt: new Date("2026-06-10T00:00:00Z"),
        },
      }),
      candidate({
        progress: 25,
        material: {
          id: "00000000-0000-0000-0000-000000000002",
          title: "Preferred Progress",
          category: "Sign Language",
          createdAt: new Date("2026-06-01T00:00:00Z"),
        },
      }),
    ],
    { goals: ["sign-lang"] },
  );

  assert.equal(ranked[0]?.material.title, "Preferred Progress");
});

test("rankRecommendedMaterials uses newest material as score tie-breaker", () => {
  const ranked = rankRecommendedMaterials(
    [
      candidate({
        material: {
          id: "00000000-0000-0000-0000-000000000001",
          title: "Older",
          createdAt: new Date("2026-06-01T00:00:00Z"),
        },
      }),
      candidate({
        material: {
          id: "00000000-0000-0000-0000-000000000002",
          title: "Newer",
          createdAt: new Date("2026-06-02T00:00:00Z"),
        },
      }),
    ],
    {},
  );

  assert.equal(ranked[0]?.material.title, "Newer");
});

test("getDailyQuizOffset is stable for the same UTC date", () => {
  const morning = new Date("2026-06-26T01:00:00Z");
  const evening = new Date("2026-06-26T23:59:59Z");

  assert.equal(getUtcDayNumber(morning), getUtcDayNumber(evening));
  assert.equal(getDailyQuizOffset(7, morning), getDailyQuizOffset(7, evening));
});

test("getDailyQuizOffset returns null when no quizzes exist", () => {
  assert.equal(getDailyQuizOffset(0, new Date("2026-06-26T00:00:00Z")), null);
});
