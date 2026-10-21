import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createHash } from "node:crypto";
import * as asar from "@electron/asar";
import { Pickle } from "@electron/asar/lib/pickle.js";
import { getFileIntegrity } from "@electron/asar/lib/integrity.js";

// Keep the existing archive data and unpacked tree intact; append one daemon module.
// A full repack cannot preserve missing optional unpacked files in the installed build.
const [source, output] = process.argv.slice(2);
assert(source && output, "Pass source app.asar and an unused project .dev output path");
assert(!fs.existsSync(output), "Output must not already exist");
assert(path.resolve(output).startsWith(path.resolve(".dev") + path.sep));
const target = "node_modules/@getpaseo/server/dist/server/server/agent/providers/claude/agent.js";
const replacement = "packages/server/dist/server/server/agent/providers/claude/agent.js";
const sha256 = async (stream) => {
  const hash = createHash("sha256");
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
};
const sourceSha256 = await sha256(fs.createReadStream(source));
const raw = asar.getRawHeader(source);
const originalHeader = structuredClone(raw.header);
const parts = target.split("/");
function targetEntry(header) {
  let files = header.files;
  for (const part of parts.slice(0, -1)) files = files[part].files;
  return files[parts.at(-1)];
}
const entry = targetEntry(raw.header);
assert(!entry.unpacked && !entry.link, "Provider must be a packed file");
const oldEntry = structuredClone(entry);
const dataStart = 8 + raw.headerSize;
const dataLength = fs.statSync(source).size - dataStart;
entry.offset = String(dataLength);
entry.size = fs.statSync(replacement).size;
entry.integrity = await getFileIntegrity(fs.createReadStream(replacement));
const headerPickle = Pickle.createEmpty();
headerPickle.writeString(JSON.stringify(raw.header));
const headerBuffer = headerPickle.toBuffer();
const sizePickle = Pickle.createEmpty();
sizePickle.writeUInt32(headerBuffer.length);
async function* archiveParts() {
  yield sizePickle.toBuffer();
  yield headerBuffer;
  yield* fs.createReadStream(source, { start: dataStart });
  yield* fs.createReadStream(replacement);
}
await pipeline(Readable.from(archiveParts()), fs.createWriteStream(output, { flags: "wx" }));
const next = asar.getRawHeader(output);
assert(asar.extractFile(output, target).equals(fs.readFileSync(replacement)));
Object.assign(targetEntry(next.header), oldEntry);
assert.deepEqual(next.header, originalHeader, "Non-target archive metadata changed");
const originalDataHash = await sha256(fs.createReadStream(source, { start: dataStart }));
const copiedDataHash = await sha256(
  fs.createReadStream(output, {
    start: 8 + next.headerSize,
    end: 8 + next.headerSize + dataLength - 1,
  }),
);
assert.equal(copiedDataHash, originalDataHash, "Original packed bytes changed");
assert.equal(await sha256(fs.createReadStream(source)), sourceSha256, "Installed archive changed");
const proof = {
  source,
  output,
  sourceSha256,
  outputSha256: await sha256(fs.createReadStream(output)),
  changedFile: target,
  replacementSha256: await sha256(fs.createReadStream(replacement)),
  allOtherMetadataAndPackedBytesPreserved: true,
  unpackedTreeUntouched: true,
  installedArchiveUnchanged: true,
};
fs.writeFileSync(`${output}.proof.json`, JSON.stringify(proof, null, 2) + "\n");
console.log(JSON.stringify(proof));
