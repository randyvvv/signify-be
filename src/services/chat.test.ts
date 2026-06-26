import { test } from "node:test";
import assert from "node:assert/strict";
import type { Material } from "../db/schema.js";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/signify_test";
process.env.JWT_SECRET ??= "test-secret";

const { buildMaterialContext } = await import("./chat.js");

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

test("buildMaterialContext handles video transcript", () => {
  const ctx = buildMaterialContext(
    material({
      type: "video",
      title: "Greetings",
      videoUrl: "https://www.youtube.com/embed/demo",
      transcript: ["Halo dan selamat datang", "Cara memperkenalkan diri"],
    }),
  );

  assert.equal(ctx.hasUsableContent, true);
  assert.match(ctx.sourceText, /Type: video/);
  assert.match(ctx.sourceText, /Video URL:/);
  assert.match(ctx.sourceText, /Transcript:/);
  assert.match(ctx.sourceText, /Halo dan selamat datang/);
});

test("buildMaterialContext handles document content", () => {
  const ctx = buildMaterialContext(
    material({
      type: "document",
      pages: 11,
      content: "Document explanation about presentation technique.",
    }),
  );

  assert.equal(ctx.hasUsableContent, true);
  assert.match(ctx.sourceText, /Type: document/);
  assert.match(ctx.sourceText, /Pages: 11/);
  assert.match(ctx.sourceText, /Document content:/);
});

test("buildMaterialContext handles article content", () => {
  const ctx = buildMaterialContext(
    material({
      type: "article",
      articleUrl: "https://example.com/article",
      content: "Article explanation about linear equations.",
    }),
  );

  assert.equal(ctx.hasUsableContent, true);
  assert.match(ctx.sourceText, /Type: article/);
  assert.match(ctx.sourceText, /Article URL:/);
  assert.match(ctx.sourceText, /Article content:/);
});

test("buildMaterialContext marks empty material as unusable", () => {
  const ctx = buildMaterialContext(
    material({
      type: "video",
      transcript: [],
      videoUrl: "https://www.youtube.com/embed/demo",
    }),
  );

  assert.equal(ctx.hasUsableContent, false);
  assert.match(ctx.sourceText, /Title: Sample/);
});
