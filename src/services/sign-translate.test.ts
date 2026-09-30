import { test } from "node:test";
import assert from "node:assert/strict";
import {
  candidateKeys,
  fetchExternalPose,
  isValidPoseBase64,
  normalizeWord,
  planSegments,
} from "./sign-translate.js";

// File .pose palsu: header float 0.2 + isi acak secukupnya.
function fakePose(): Buffer {
  const buf = Buffer.alloc(64);
  buf.writeFloatLE(0.2, 0);
  return buf;
}

function fakeFetch(res: Response, calls: { url: string; init?: RequestInit }[]): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return res;
  }) as typeof fetch;
}

const SIGN_MT = "https://example.test/spoken_text_to_signed_pose";

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

test("fetchExternalPose(signmt): GET dengan query, biner .pose -> base64", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const pose = await fetchExternalPose({
    provider: "signmt",
    url: SIGN_MT,
    text: "thank you",
    signedLanguage: "ase",
    spokenLanguage: "en",
    fetchImpl: fakeFetch(new Response(fakePose(), { status: 200, headers: { "content-type": "application/pose" } }), calls),
  });
  assert.equal(pose, fakePose().toString("base64"));
  const url = new URL(calls[0]!.url);
  assert.equal(url.searchParams.get("text"), "thank you");
  assert.equal(url.searchParams.get("spoken"), "en");
  assert.equal(url.searchParams.get("signed"), "ase");
  assert.equal(calls[0]!.init?.method, undefined); // GET
});

test("fetchExternalPose(signmt): 'No poses found' -> null (bukan error)", async () => {
  const pose = await fetchExternalPose({
    provider: "signmt",
    url: SIGN_MT,
    text: "halo",
    signedLanguage: "ins",
    spokenLanguage: "id",
    fetchImpl: fakeFetch(new Response('{"message":"No poses found for halo/halo"}', { status: 500 }), []),
  });
  assert.equal(pose, null);
});

test("fetchExternalPose(signmt): error lain & file rusak dilempar", async () => {
  await assert.rejects(
    fetchExternalPose({
      provider: "signmt", url: SIGN_MT, text: "hi", signedLanguage: "ase", spokenLanguage: "en",
      fetchImpl: fakeFetch(new Response("boom", { status: 502 }), []),
    }),
    /sign\.mt 502/,
  );
  await assert.rejects(
    fetchExternalPose({
      provider: "signmt", url: SIGN_MT, text: "hi", signedLanguage: "ase", spokenLanguage: "en",
      fetchImpl: fakeFetch(new Response("<html>not a pose</html>", { status: 200 }), []),
    }),
    /tidak valid/,
  );
});

test("fetchExternalPose(signgpt): POST JSON -> field pose", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const b64 = fakePose().toString("base64");
  const pose = await fetchExternalPose({
    provider: "signgpt",
    url: "https://signgpt.test/api/translate-pose",
    text: "hello",
    signedLanguage: "ase",
    spokenLanguage: "en",
    fetchImpl: fakeFetch(Response.json({ pose: b64 }), calls),
  });
  assert.equal(pose, b64);
  assert.equal(calls[0]!.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0]!.init?.body)), { signedLanguage: "ase", spokenLanguage: "en", text: "hello" });
});
