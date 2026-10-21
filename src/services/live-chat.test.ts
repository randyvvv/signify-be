import { test } from "node:test";
import assert from "node:assert/strict";
import { ChatRateLimiter, MAX_CHAT_CHARS, normalizeChatText } from "./live-chat.js";

test("normalizeChatText: satu baris rapi, kosong/terlalu panjang ditolak", () => {
  assert.equal(normalizeChatText("  Bu,  boleh\n diulang?  "), "Bu, boleh diulang?");
  assert.equal(normalizeChatText("   \n\t "), null);
  assert.equal(normalizeChatText("a".repeat(MAX_CHAT_CHARS)), "a".repeat(MAX_CHAT_CHARS));
  assert.equal(normalizeChatText("a".repeat(MAX_CHAT_CHARS + 1)), null);
});

test("ChatRateLimiter: jeda minimal antarpesan per pengguna", () => {
  const limiter = new ChatRateLimiter(800, 20);
  assert.equal(limiter.allow("u1", 1000), true);
  assert.equal(limiter.allow("u1", 1500), false);
  assert.equal(limiter.allow("u2", 1500), true);
  assert.equal(limiter.allow("u1", 1800), true);
});

test("ChatRateLimiter: paling banyak N pesan per menit", () => {
  const limiter = new ChatRateLimiter(0, 3);
  assert.equal(limiter.allow("u1", 0), true);
  assert.equal(limiter.allow("u1", 10), true);
  assert.equal(limiter.allow("u1", 20), true);
  assert.equal(limiter.allow("u1", 30), false);
  // Setelah satu menit dari pesan pertama, kuota terbuka lagi.
  assert.equal(limiter.allow("u1", 60_001), true);
});
