import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSentence, normalizeSpeechText, pcmToWav, sampleRateFromMime } from "./speech.js";

test("pcmToWav: header WAV 16-bit mono sesuai laju sampel", () => {
  const pcm = Buffer.from([1, 0, 2, 0, 3, 0, 4, 0]);
  const wav = pcmToWav(pcm, 24_000);
  assert.equal(wav.length, 44 + pcm.length);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.readUInt32LE(4), 36 + pcm.length);
  assert.equal(wav.toString("ascii", 8, 16), "WAVEfmt ");
  assert.equal(wav.readUInt16LE(20), 1);
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(24), 24_000);
  assert.equal(wav.readUInt32LE(28), 48_000);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.toString("ascii", 36, 40), "data");
  assert.equal(wav.readUInt32LE(40), pcm.length);
  assert.deepEqual(wav.subarray(44), pcm);
});

test("sampleRateFromMime: baca rate dari mimeType Gemini, default 24 kHz", () => {
  assert.equal(sampleRateFromMime("audio/L16;codec=pcm;rate=24000"), 24_000);
  assert.equal(sampleRateFromMime("audio/L16;rate=16000"), 16_000);
  assert.equal(sampleRateFromMime("audio/L16"), 24_000);
  assert.equal(sampleRateFromMime(undefined), 24_000);
});

test("normalizeSpeechText: rapikan spasi", () => {
  assert.equal(normalizeSpeechText("  SAYA   MAU  KOPI "), "SAYA MAU KOPI");
  assert.equal(normalizeSpeechText(" halo\n\tteman "), "halo teman");
});

test("cleanSentence: ambil satu kalimat tanpa tanda kutip pembungkus", () => {
  assert.equal(cleanSentence('"Saya mau dua kopi panas."', "x"), "Saya mau dua kopi panas.");
  assert.equal(cleanSentence("\n  I want two hot coffees.  \nExplanation: ...", "x"), "I want two hot coffees.");
  assert.equal(cleanSentence("“Terima kasih banyak!”", "x"), "Terima kasih banyak!");
});

test("cleanSentence: jawaban kosong memakai teks asli", () => {
  assert.equal(cleanSentence("", "SAYA MAU KOPI"), "SAYA MAU KOPI");
  assert.equal(cleanSentence(undefined, "HALO"), "HALO");
  assert.equal(cleanSentence('""', "HALO"), "HALO");
});
