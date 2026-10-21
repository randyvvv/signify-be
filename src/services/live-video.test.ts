import { test } from "node:test";
import assert from "node:assert/strict";
import { verify } from "hono/jwt";
import { createVideoToken, liveKitApiUrl, videoRoomName } from "./live-video.js";

const credentials = { apiKey: "test-key", apiSecret: "test-secret-that-is-long-enough-for-hs256" };

test("createVideoToken: peserta boleh menyiarkan kamera & mikrofon di room kelasnya", async () => {
  const jwt = await createVideoToken(credentials, { classId: "c1", userId: "u1", name: "Ms. Rina" });
  const payload = (await verify(jwt, credentials.apiSecret, "HS256")) as Record<string, any>;
  assert.equal(payload.iss, "test-key");
  assert.equal(payload.sub, "u1");
  assert.equal(payload.name, "Ms. Rina");
  assert.equal(payload.video.room, videoRoomName("c1"));
  assert.equal(payload.video.roomJoin, true);
  assert.equal(payload.video.canPublish, true);
  assert.deepEqual(payload.video.canPublishSources, ["camera", "microphone"]);
  assert.ok(payload.exp > Date.now() / 1000 + 5 * 3600);
});

test("createVideoToken: murid juga bisa kamera & mic, tetap tanpa data channel atau berbagi layar", async () => {
  const jwt = await createVideoToken(credentials, { classId: "c1", userId: "u2", name: null });
  const payload = (await verify(jwt, credentials.apiSecret, "HS256")) as Record<string, any>;
  assert.equal(payload.video.canPublish, true);
  assert.equal(payload.video.canSubscribe, true);
  assert.equal(payload.video.canPublishData, false);
  assert.ok(!payload.video.canPublishSources.includes("screen_share"));
});

test("liveKitApiUrl: wss -> https, ws -> http", () => {
  assert.equal(liveKitApiUrl("wss://signify-abc.livekit.cloud"), "https://signify-abc.livekit.cloud");
  assert.equal(liveKitApiUrl("ws://localhost:7880"), "http://localhost:7880");
  assert.equal(liveKitApiUrl("https://x.livekit.cloud"), "https://x.livekit.cloud");
});
