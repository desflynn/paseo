import assert from "node:assert/strict";
import { mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { audioDuration, parseAfinfoDuration } from "../server/audio-duration.ts";
import { readAudio } from "../server/read-audio.ts";
import { MAX_AUDIO_BYTES, audioMimeFromPath, formatDuration, readAudioRpc } from "./read-audio.ts";

test("read-audio contract keeps the read-image shape", () => {
  assert.equal(readAudioRpc.name, "read-audio");
  assert.equal(MAX_AUDIO_BYTES, 16 * 1024 * 1024);
});

test("audioMimeFromPath allowlists mp3/m4a/wav/ogg and rejects the rest", () => {
  assert.equal(audioMimeFromPath("/a/b/report.mp3"), "audio/mpeg");
  assert.equal(audioMimeFromPath("/a/b/voice.M4A"), "audio/mp4");
  assert.equal(audioMimeFromPath("/a/b/tone.wav"), "audio/wav");
  assert.equal(audioMimeFromPath("/a/b/take.ogg"), "audio/ogg");
  assert.equal(audioMimeFromPath("/a/b/notes.txt"), null);
  assert.equal(audioMimeFromPath("/a/b/pic.png"), null);
  assert.equal(audioMimeFromPath("not-a-path"), null);
});

test("read-audio returns base64 for a small temp mp3", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sm-audio-"));
  try {
    const path = join(dir, "clip.mp3");
    const bytes = Uint8Array.from([0xff, 0xfb, 0x10, 0x00, 0x01, 0x02]);
    await writeFile(path, bytes);
    const result = await readAudio({ path });
    assert.deepEqual(result, {
      ok: true,
      mime: "audio/mpeg",
      base64: Buffer.from(bytes).toString("base64"),
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("read-audio rejects unsupported extensions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sm-audio-"));
  try {
    const path = join(dir, "notes.txt");
    await writeFile(path, "hello");
    const result = await readAudio({ path });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /unsupported audio type/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("read-audio rejects files over the 16 MiB cap", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sm-audio-"));
  try {
    const path = join(dir, "big.mp3");
    await writeFile(path, "");
    await truncate(path, MAX_AUDIO_BYTES + 1); // sparse: stat size counts, bytes never written
    const result = await readAudio({ path });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /audio too large/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("read-audio reports missing files as an error result", async () => {
  const result = await readAudio({ path: "/nonexistent/sm-audio/clip.mp3" });
  assert.equal(result.ok, false);
});

test("read-audio rejects relative paths", async () => {
  const result = await readAudio({ path: "relative/clip.mp3" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /not an absolute path/);
});

// --- duration ------------------------------------------------------------------

test("formatDuration renders m:ss and h:mm:ss", () => {
  assert.equal(formatDuration(314.226939), "5:14");
  assert.equal(formatDuration(59.6), "1:00");
  assert.equal(formatDuration(3725), "1:02:05");
});

test("parseAfinfoDuration reads the estimated duration line", () => {
  assert.equal(
    parseAfinfoDuration("bit rate: 105600\nestimated duration: 314.226939 sec\n"),
    314.226939,
  );
  assert.equal(parseAfinfoDuration("Couldn't open the file"), null);
});

test("audio-duration measures a real 1 s wav, and gives null for non-audio", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sm-audio-"));
  try {
    const rate = 8000;
    const wav = Buffer.alloc(44 + rate);
    wav.write("RIFF", 0);
    wav.writeUInt32LE(36 + rate, 4);
    wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20); // PCM
    wav.writeUInt16LE(1, 22); // mono
    wav.writeUInt32LE(rate, 24);
    wav.writeUInt32LE(rate, 28);
    wav.writeUInt16LE(1, 32);
    wav.writeUInt16LE(8, 34);
    wav.write("data", 36);
    wav.writeUInt32LE(rate, 40);
    const path = join(dir, "tone.wav");
    await writeFile(path, wav);
    const { seconds } = await audioDuration({ path });
    if (process.platform === "darwin") assert.ok(seconds !== null && Math.abs(seconds - 1) < 0.01);
    assert.deepEqual(await audioDuration({ path: join(dir, "notes.txt") }), { seconds: null });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
