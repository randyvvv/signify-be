import { test } from "node:test";
import assert from "node:assert/strict";
import { nextStreak, todayStr } from "./activity.js";

test("nextStreak: belum pernah aktif -> 1", () => {
  assert.equal(nextStreak(null, "2026-06-01", 0), 1);
  assert.equal(nextStreak(null, "2026-06-01", 5), 1);
});

test("nextStreak: sudah aktif hari ini -> tidak berubah (min 1)", () => {
  assert.equal(nextStreak("2026-06-01", "2026-06-01", 5), 5);
  assert.equal(nextStreak("2026-06-01", "2026-06-01", 0), 1);
});

test("nextStreak: aktif kemarin (beruntun) -> +1", () => {
  assert.equal(nextStreak("2026-05-31", "2026-06-01", 5), 6);
  // lintas bulan
  assert.equal(nextStreak("2026-02-28", "2026-03-01", 3), 4);
});

test("nextStreak: ada hari bolong -> reset ke 1", () => {
  assert.equal(nextStreak("2026-05-28", "2026-06-01", 9), 1);
  assert.equal(nextStreak("2026-05-30", "2026-06-01", 9), 1);
});

test("todayStr: format YYYY-MM-DD", () => {
  assert.match(todayStr(new Date("2026-06-01T13:45:00Z")), /^2026-06-01$/);
});
