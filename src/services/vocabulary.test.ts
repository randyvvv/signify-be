import { test } from "node:test";
import assert from "node:assert/strict";
import { schedule, type CardState } from "./vocabulary.js";

const NEW: CardState = { repetitions: 0, intervalDays: 0, ease: 250, lapses: 0 };
const TODAY = "2026-06-01";

test("schedule: kartu baru + good -> 1 hari", () => {
  const next = schedule(NEW, "good", TODAY);
  assert.equal(next.intervalDays, 1);
  assert.equal(next.repetitions, 1);
  assert.equal(next.dueDate, "2026-06-02");
});

test("schedule: good beruntun -> 1, 3, lalu interval x ease", () => {
  const a = schedule(NEW, "good", TODAY);
  const b = schedule(a, "good", TODAY);
  const c = schedule(b, "good", TODAY);
  assert.equal(b.intervalDays, 3);
  assert.equal(c.intervalDays, 8); // round(3 * 2.5)
});

test("schedule: again -> reset, lapses +1, ease turun (min 130)", () => {
  const card: CardState = { repetitions: 4, intervalDays: 20, ease: 140, lapses: 1 };
  const next = schedule(card, "again", TODAY);
  assert.equal(next.repetitions, 0);
  assert.equal(next.intervalDays, 1);
  assert.equal(next.lapses, 2);
  assert.equal(next.ease, 130);
});

test("schedule: easy menaikkan ease dan melompat lebih jauh dari good", () => {
  const card: CardState = { repetitions: 2, intervalDays: 3, ease: 250, lapses: 0 };
  const good = schedule(card, "good", TODAY);
  const easy = schedule(card, "easy", TODAY);
  assert.ok(easy.intervalDays > good.intervalDays);
  assert.equal(easy.ease, 265);
});

test("schedule: hard selalu menambah interval minimal 1 hari", () => {
  const card: CardState = { repetitions: 2, intervalDays: 2, ease: 250, lapses: 0 };
  const next = schedule(card, "hard", TODAY);
  assert.equal(next.intervalDays, 3);
  assert.equal(next.ease, 235);
});

test("schedule: dueDate melewati batas bulan", () => {
  const card: CardState = { repetitions: 1, intervalDays: 1, ease: 250, lapses: 0 };
  assert.equal(schedule(card, "good", "2026-01-30").dueDate, "2026-02-02");
});
