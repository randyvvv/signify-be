import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLASS_CODE_LENGTH,
  TranscriptSegmenter,
  generateClassCode,
  normalizeClassCode,
  splitSentences,
} from "./live-transcript.js";

test("generateClassCode: 6 karakter tanpa I/O/0/1", () => {
  for (let i = 0; i < 200; i++) {
    const code = generateClassCode();
    assert.equal(code.length, CLASS_CODE_LENGTH);
    assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
  }
  assert.equal(generateClassCode(() => 0), "AAAAAA");
});

test("normalizeClassCode: huruf besar, buang spasi & tanda hubung", () => {
  assert.equal(normalizeClassCode(" k7p-2qx "), "K7P2QX");
});

test("splitSentences: pecah di akhir kalimat, kalimat panjang dipotong di batas kata", () => {
  assert.deepEqual(splitSentences("Good morning, everyone.  Today we learn.\nAny questions?"), [
    "Good morning, everyone.",
    "Today we learn.",
    "Any questions?",
  ]);
  assert.deepEqual(splitSentences("Open page 10.5 now"), ["Open page 10.5 now"]);
  const long = splitSentences("word ".repeat(100));
  assert.ok(long.length > 1);
  assert.ok(long.every((s) => s.length <= 200));
});

test("segmenter: interim hanya subtitle sampai kalimat tertutup & stabil", () => {
  const s = new TranscriptSegmenter();
  assert.deepEqual(s.interim("Good"), { partial: "Good", sentences: [] });
  assert.deepEqual(s.interim("Good morning."), { partial: "Good morning.", sentences: [] });
  // Tanda baca interim berubah ("." -> ","), belum ada yang dikirim.
  assert.deepEqual(s.interim("Good morning, everyone. Today"), {
    partial: "Good morning, everyone. Today",
    sentences: [],
  });
  // Kalimat pertama tertutup & sama dengan interim sebelumnya -> dikirim lebih awal.
  assert.deepEqual(s.interim("Good morning, everyone. Today we"), {
    partial: "Today we",
    sentences: ["Good morning, everyone."],
  });
  // Final: hanya kalimat yang belum dikirim.
  assert.deepEqual(s.final("Good morning, everyone. Today we will learn about plants."), {
    partial: "",
    sentences: ["Today we will learn about plants."],
  });
});

test("segmenter: ucapan pendek langsung jadi segmen saat final, lalu mulai dari nol", () => {
  const s = new TranscriptSegmenter();
  s.interim("Now, please");
  assert.deepEqual(s.final("Now, please open your book to page 10."), {
    partial: "",
    sentences: ["Now, please open your book to page 10."],
  });
  assert.deepEqual(s.interim("Plants need"), { partial: "Plants need", sentences: [] });
});

test("segmenter: flush memfinalkan sisa interim bila sesi putus", () => {
  const s = new TranscriptSegmenter();
  s.interim("Plants need water and sunlight");
  assert.deepEqual(s.flush(), { partial: "", sentences: ["Plants need water and sunlight"] });
  assert.deepEqual(s.flush(), { partial: "", sentences: [] });
});
