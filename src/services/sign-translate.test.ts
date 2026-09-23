import { test } from "node:test";
import assert from "node:assert/strict";
import {
  candidateKeys,
  isValidPoseBase64,
  normalizeWord,
  planSegments,
} from "./sign-translate.js";

test("normalizeWord: lowercase, tanpa tanda baca, spasi tunggal", () => {
  assert.equal(normalizeWord("  Thank   YOU! "), "thank you");
  assert.equal(normalizeWord("Terima kasih."), "terima kasih");
  assert.equal(normalizeWord("?!"), "");
});

test("candidateKeys: semua n-gram sampai 4 kata", () => {
  const keys = candidateKeys("Selamat pagi, teman!");
  assert.deepEqual(keys.sort(), [
    "pagi",
    "pagi teman",
    "selamat",
    "selamat pagi",
    "selamat pagi teman",
    "teman",
  ]);
});

test("planSegments: frasa terpanjang dari kamus diutamakan", () => {
  const dict = new Set(["terima kasih", "terima"]);
  const plan = planSegments("Terima kasih banyak", (k) => dict.has(k));
  assert.deepEqual(plan, [
    { text: "Terima kasih", dictionaryKey: "terima kasih" },
    { text: "banyak", dictionaryKey: null },
  ]);
});

test("planSegments: kata di luar kamus digabung jadi satu segmen", () => {
  const dict = new Set(["halo"]);
  const plan = planSegments("apa kabar halo semua orang", (k) => dict.has(k));
  assert.deepEqual(plan, [
    { text: "apa kabar", dictionaryKey: null },
    { text: "halo", dictionaryKey: "halo" },
    { text: "semua orang", dictionaryKey: null },
  ]);
});

test("planSegments: kamus kosong -> satu segmen utuh", () => {
  assert.deepEqual(planSegments("hello world", () => false), [
    { text: "hello world", dictionaryKey: null },
  ]);
});

test("isValidPoseBase64: cek versi header .pose", () => {
  const buf = Buffer.alloc(32);
  buf.writeFloatLE(0.1, 0);
  assert.equal(isValidPoseBase64(buf.toString("base64")), true);
  buf.writeFloatLE(3.5, 0);
  assert.equal(isValidPoseBase64(buf.toString("base64")), false);
  assert.equal(isValidPoseBase64("bm90IGEgcG9zZQ=="), false);
});
