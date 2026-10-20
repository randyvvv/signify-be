import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cuesDurationMinutes,
  cuesToParagraphs,
  parseGeneratedMaterial,
  youtubeEmbedUrl,
  youtubeThumbnailUrl,
} from "./teacher-content.js";

test("youtube helpers: embed & thumbnail URL", () => {
  assert.equal(youtubeEmbedUrl("wi_hiz7INks"), "https://www.youtube.com/embed/wi_hiz7INks");
  assert.equal(youtubeThumbnailUrl("wi_hiz7INks"), "https://i.ytimg.com/vi/wi_hiz7INks/hqdefault.jpg");
});

test("cuesToParagraphs: gabung caption pendek, tutup paragraf di akhir kalimat", () => {
  const cues = [
    { text: "Plants need", offset: 0, duration: 1000 },
    { text: "water and sunlight.", offset: 1000, duration: 1000 },
    { text: "  ", offset: 2000, duration: 500 },
    { text: "Leaves make food.", offset: 2500, duration: 1500 },
  ];
  assert.deepEqual(cuesToParagraphs(cues, 20), ["Plants need water and sunlight.", "Leaves make food."]);
  assert.deepEqual(cuesToParagraphs(cues), ["Plants need water and sunlight. Leaves make food."]);
  assert.equal(cuesDurationMinutes(cues), 1);
  assert.equal(cuesDurationMinutes([{ text: "x", offset: 125_000, duration: 2_000 }]), 3);
  assert.equal(cuesDurationMinutes([]), null);
});

const valid = {
  title: "How plants grow",
  description: "Plants need water and sunlight.",
  sections: ["## Water\nPlants drink water.", "## Sunlight\nLeaves use light."],
  quiz: [0, 1, 2].map((i) => ({
    question: `Question ${i}?`,
    options: ["Water", "Sand", "Plastic", "Metal"],
    correctIndex: 0,
  })),
};

test("parseGeneratedMaterial: menerima keluaran valid", () => {
  assert.deepEqual(parseGeneratedMaterial(JSON.stringify(valid)), valid);
});

test("parseGeneratedMaterial: menolak keluaran tidak valid", () => {
  const bad = [
    "not json",
    JSON.stringify({ ...valid, sections: [] }),
    JSON.stringify({ ...valid, quiz: valid.quiz.slice(0, 2) }),
    JSON.stringify({ ...valid, quiz: [{ ...valid.quiz[0], options: ["A", "B", "C"] }, ...valid.quiz] }),
    JSON.stringify({ ...valid, quiz: [{ ...valid.quiz[0], correctIndex: 4 }, ...valid.quiz] }),
    JSON.stringify({ ...valid, quiz: [{ ...valid.quiz[0], options: ["A", "a", "B", "C"] }, ...valid.quiz] }),
  ];
  for (const raw of bad) assert.throws(() => parseGeneratedMaterial(raw));
});
