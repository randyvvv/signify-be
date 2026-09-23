import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSignQuizQuestions } from "./tools.js";
import { describeCards } from "./coach.js";

const identity = <T>(arr: T[]) => [...arr];

test("buildSignQuizQuestions: 4 opsi, jawaban benar ada di correctIndex", () => {
  const qs = buildSignQuizQuestions(
    [
      { term: "Hello", distractors: ["Goodbye", "Thanks", "Sorry"] },
      { term: "Thank you", distractors: ["Please", "Yes", "No"] },
      { term: "Work", distractors: ["Play", "Rest", "Eat"] },
    ],
    identity,
  );
  assert.equal(qs.length, 3);
  for (const q of qs) {
    assert.equal(q.options.length, 4);
    assert.equal(q.options[q.correctIndex], q.term);
  }
});

test("buildSignQuizQuestions: term duplikat dibuang, pengecoh kurang diisi term lain", () => {
  const qs = buildSignQuizQuestions(
    [
      { term: "Hello", distractors: ["hello!", "Hi"] }, // "hello!" sama dengan term -> dibuang
      { term: "HELLO", distractors: [] }, // duplikat term
      { term: "Name", distractors: [] },
      { term: "Work", distractors: [] },
    ],
    identity,
  );
  assert.deepEqual(qs.map((q) => q.term), ["Hello", "Name", "Work"]);
  assert.deepEqual(qs[0]!.options, ["Hello", "Hi", "Name", "Work"]);
  // Tidak ada opsi yang sama (setelah normalisasi) dalam satu soal.
  for (const q of qs) {
    const keys = q.options.map((o) => o.toLowerCase().replace(/[^a-z ]/g, ""));
    assert.equal(new Set(keys).size, keys.length);
  }
});

test("describeCards: ringkas kartu untuk riwayat model", () => {
  const text = describeCards([
    { type: "quiz", quizId: "q1", title: "Interview", level: "BEGINNER", questionCount: 5 },
    { type: "vocabulary", words: ["hello", "work"], added: 2 },
  ]);
  assert.match(text, /created quiz "Interview" \(quiz_id q1, 5 questions\)/);
  assert.match(text, /added to My Signs: hello, work/);
});
