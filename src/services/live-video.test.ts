import { test } from "node:test";
import assert from "node:assert/strict";
import { verify } from "hono/jwt";
import { createVideoToken, videoRoomName } from "./live-video.js";

const credentials = { apiKey: "test-key", apiSecret: "test-secret-that-is-long-enough-for-hs256" };

test("createVideoToken: guru boleh menyiarkan kamera & mikrofon di room kelasnya", async () => {
  const jwt = await createVideoToken(credentials, { classId: "c1", userId: "u1", name: "Ms. Rina", canPublish: true });
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

test("createVideoToken: murid hanya menonton", async () => {
  const jwt = await createVideoToken(credentials, { classId: "c1", userId: "u2", name: null, canPublish: false });
  const payload = (await verify(jwt, credentials.apiSecret, "HS256")) as Record<string, any>;
  assert.equal(payload.video.canPublish, false);
  assert.equal(payload.video.canSubscribe, true);
  assert.equal(payload.video.canPublishData, false);
});
