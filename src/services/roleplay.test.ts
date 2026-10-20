import { test } from "node:test";
import assert from "node:assert/strict";
import { SCENARIOS, findScenario, normalizeGloss, parseGeminiTurn, scriptTurn } from "./roleplay.js";

const cafe = findScenario("cafe")!;

test("skenario: id unik, tiap langkah punya saran balasan di en & id", () => {
  assert.equal(new Set(SCENARIOS.map((s) => s.id)).size, SCENARIOS.length);
  for (const s of SCENARIOS) {
    assert.ok(s.steps.length >= 3, s.id);
    for (const step of s.steps) {
      assert.ok(step.line.en && step.line.id, s.id);
      assert.ok(step.replies.length >= 2, s.id);
      for (const r of step.replies) {
        assert.ok(r.text.en && r.text.id && r.gloss.en && r.gloss.id, s.id);
        assert.equal(normalizeGloss(r.gloss.en), r.gloss.en, `${s.id}: ${r.gloss.en}`);
        assert.equal(normalizeGloss(r.gloss.id), r.gloss.id, `${s.id}: ${r.gloss.id}`);
      }
    }
  }
});

test("scriptTurn: pembuka, lanjutan, lalu penutup dengan ringkasan", () => {
  const opening = scriptTurn(cafe, "id", 0);
  assert.equal(opening.line, "Halo, selamat datang! Mau minum apa hari ini?");
  assert.deepEqual(opening.replies[0], { text: "Kopi satu, ya.", gloss: "KOPI SATU" });
  assert.equal(opening.done, false);

  const end = scriptTurn(cafe, "en", cafe.steps.length);
  assert.equal(end.done, true);
  assert.deepEqual(end.replies, []);
  assert.equal(end.summary, cafe.summary.en);
  assert.equal(end.source, "script");
});

test("normalizeGloss: huruf besar, tanpa tanda baca, maksimal 3 isyarat", () => {
  assert.equal(normalizeGloss("coffee, please!"), "COFFEE PLEASE");
  assert.equal(normalizeGloss("I  want hot coffee now"), "I WANT HOT");
  assert.equal(normalizeGloss("terima kasih"), "TERIMA KASIH");
  assert.equal(normalizeGloss("..."), "");
});

test("parseGeminiTurn: saran dirapikan & dibatasi 3", () => {
  const raw = JSON.stringify({
    line: "Hot or cold?",
    replies: [
      { text: "Hot", gloss: "hot please" },
      { text: "Cold", gloss: "COLD" },
      { text: "Iced", gloss: "ice cold drink please" },
      { text: "Warm", gloss: "warm" },
    ],
  });
  const turn = parseGeminiTurn(raw, cafe, "en", 1);
  assert.equal(turn.source, "gemini");
  assert.equal(turn.done, false);
  assert.deepEqual(
    turn.replies.map((r) => r.gloss),
    ["HOT PLEASE", "COLD", "ICE COLD DRINK"],
  );
});

test("parseGeminiTurn: saran kosong memakai saran skrip", () => {
  const turn = parseGeminiTurn(JSON.stringify({ line: "Anything to eat?", replies: [] }), cafe, "en", 2);
  assert.deepEqual(turn.replies, scriptTurn(cafe, "en", 2).replies);
});

test("parseGeminiTurn: giliran terakhir tanpa saran, ringkasan cadangan dari skrip", () => {
  const raw = JSON.stringify({ line: "Enjoy your coffee!", replies: [{ text: "Bye", gloss: "BYE" }] });
  const turn = parseGeminiTurn(raw, cafe, "id", cafe.steps.length);
  assert.equal(turn.done, true);
  assert.deepEqual(turn.replies, []);
  assert.equal(turn.summary, cafe.summary.id);
});

test("parseGeminiTurn: JSON rusak dilempar (nextTurn lalu memakai skrip)", () => {
  assert.throws(() => parseGeminiTurn("not json", cafe, "en", 1));
  assert.throws(() => parseGeminiTurn(JSON.stringify({ replies: [] }), cafe, "en", 1));
});
