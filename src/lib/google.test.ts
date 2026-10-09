import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { sign } from "hono/jwt";
import type { HonoJsonWebKey } from "hono/utils/jwt/jws";
import { verifyGoogleIdToken } from "./google.js";

const CLIENT_ID = "signify-test.apps.googleusercontent.com";

function keyPair(kid: string) {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pub = { ...publicKey.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" } as HonoJsonWebKey;
  const priv = { ...privateKey.export({ format: "jwk" }), kid, alg: "RS256" } as HonoJsonWebKey;
  return { pub, priv };
}

const google = keyPair("google-key-1");
const attacker = keyPair("google-key-1");

function idToken(overrides: Record<string, unknown> = {}, key = google.priv) {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      iss: "https://accounts.google.com",
      aud: CLIENT_ID,
      sub: "1234567890",
      email: "learner@gmail.com",
      email_verified: true,
      name: "Signify Learner",
      picture: "https://lh3.googleusercontent.com/a/photo",
      iat: now,
      exp: now + 3600,
      ...overrides,
    },
    key,
    "RS256",
  );
}

const verifyOpts = { audience: [CLIENT_ID], keys: [google.pub] };

test("verifyGoogleIdToken: token valid -> profil Google", async () => {
  const profile = await verifyGoogleIdToken(await idToken(), verifyOpts);
  assert.deepEqual(profile, {
    sub: "1234567890",
    email: "learner@gmail.com",
    name: "Signify Learner",
    picture: "https://lh3.googleusercontent.com/a/photo",
  });
});

test("verifyGoogleIdToken: issuer tanpa https dan iat sedikit di depan tetap diterima", async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = await idToken({ iss: "accounts.google.com", iat: now + 30 });
  const profile = await verifyGoogleIdToken(token, verifyOpts);
  assert.equal(profile.sub, "1234567890");
});

test("verifyGoogleIdToken: menolak token yang tidak valid", async () => {
  const now = Math.floor(Date.now() / 1000);
  const cases: [string, Promise<string>][] = [
    ["client ID lain", idToken({ aud: "other-app.apps.googleusercontent.com" })],
    ["issuer palsu", idToken({ iss: "https://evil.example.com" })],
    ["kedaluwarsa", idToken({ iat: now - 7200, exp: now - 3600 })],
    ["tanpa exp", idToken({ exp: undefined })],
    ["email belum terverifikasi", idToken({ email_verified: false })],
    ["tanpa email", idToken({ email: undefined })],
    ["ditandatangani kunci lain", idToken({}, attacker.priv)],
  ];
  for (const [label, token] of cases) {
    await assert.rejects(verifyGoogleIdToken(await token, verifyOpts), `${label} harus ditolak`);
  }
});

test("verifyGoogleIdToken: menolak token HS256 (bukan kunci Google)", async () => {
  const token = await sign({ sub: "1", email: "a@b.c", email_verified: true, aud: CLIENT_ID }, "secret", "HS256");
  await assert.rejects(verifyGoogleIdToken(token, verifyOpts));
});
