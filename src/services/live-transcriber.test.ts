import { test } from "node:test";
import assert from "node:assert/strict";
import { liveModelName } from "./live-transcriber.js";

test("liveModelName: Vertex + project -> nama model lengkap", () => {
  assert.equal(
    liveModelName("gemini-3.5-transcribe-live", { enabled: true, project: "670229444238", location: "global" }),
    "projects/670229444238/locations/global/publishers/google/models/gemini-3.5-transcribe-live",
  );
});

test("liveModelName: tanpa Vertex, tanpa project, atau sudah lengkap -> apa adanya", () => {
  assert.equal(liveModelName("gemini-3.5-transcribe-live", { enabled: false, project: "p", location: "global" }), "gemini-3.5-transcribe-live");
  assert.equal(liveModelName("gemini-3.5-transcribe-live", { enabled: true, location: "global" }), "gemini-3.5-transcribe-live");
  const full = "projects/p/locations/us-central1/publishers/google/models/m";
  assert.equal(liveModelName(full, { enabled: true, project: "q", location: "global" }), full);
});
