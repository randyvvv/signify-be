import { test } from "node:test";
import assert from "node:assert/strict";
import { readingMinutes, slugify } from "./news.js";

test("slugify: huruf kecil, tanda baca jadi tanda hubung", () => {
  assert.equal(
    slugify("Signify Advances to the HackAstone 2026 Grand Final!"),
    "signify-advances-to-the-hackastone-2026-grand-final",
  );
  assert.equal(slugify("  Café & Bahasa Isyarat  "), "cafe-bahasa-isyarat");
});

test("slugify: dipotong maks 120 karakter tanpa tanda hubung di ujung", () => {
  const slug = slugify("kata ".repeat(60));
  assert.ok(slug.length <= 120);
  assert.ok(!slug.endsWith("-"));
});

test("readingMinutes: minimal 1 menit, gambar tidak dihitung", () => {
  assert.equal(readingMinutes("Halo"), 1);
  assert.equal(readingMinutes(`![${"foto ".repeat(500)}](/a.jpg)`), 1);
  assert.equal(readingMinutes("kata ".repeat(600)), 3);
});
