#!/usr/bin/env node
/**
 * Build every deployable Paseo artifact from one prepared tree.
 *
 * `npm run build:all`
 *
 * The expensive part is preparation: app deps, the Electron web export, the server
 * and the Electron main bundle. That runs once here. Packaging then runs per
 * target, because a desktop binary carries its own Electron runtime and there is
 * no universal binary for Linux or Windows — only macOS can be lipo'd into one.
 *
 * Output: artifacts/release-<timestamp>/<target>/..., plus MANIFEST.txt with the
 * size and sha256 of every file, so a deploy never has to ask "which build is this".
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const desktopDir = path.join(root, "packages/desktop");
const appDir = path.join(root, "packages/app");
const releaseDir = path.join(desktopDir, "release");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "");
const outRoot = path.join(root, "artifacts", `release-${stamp}`);

function run(command, args, cwd) {
  process.stdout.write(`\n▸ ${command} ${args.join(" ")}  (${path.relative(root, cwd) || "."})\n`);
  const result = spawnSync(command, args, { cwd, stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with ${result.status}`);
  }
}

function filesNewerThan(directory, since) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .map((name) => path.join(directory, name))
    .filter((file) => {
      try {
        const stats = statSync(file);
        return stats.isFile() && stats.mtimeMs >= since;
      } catch {
        return false;
      }
    });
}

/** Copy the artifacts a target just produced, so a later target cannot overwrite them. */
function harvest(target, since) {
  const produced = filesNewerThan(releaseDir, since);
  if (produced.length === 0) {
    throw new Error(`target ${target} produced no files in ${releaseDir}`);
  }
  const targetDir = path.join(outRoot, target);
  mkdirSync(targetDir, { recursive: true });
  return produced.map((file) => {
    const destination = path.join(targetDir, path.basename(file));
    copyFileSync(file, destination);
    return destination;
  });
}

// ---- preparation, once ----
run("npm", ["run", "build:app-deps:clean"], root);
run(
  "npx",
  ["expo", "export", "--platform", "web"],
  appDir,
);
run("npm", ["run", "build:server:clean"], root);
run("npm", ["run", "build:main", "--workspace=@getpaseo/desktop"], root);

// ---- packaging, one pass per target ----
const targets = [
  { name: "mac-arm64", args: ["--mac", "--arm64"] },
  { name: "linux-x64", args: ["--linux", "AppImage", "tar.gz", "--x64"] },
  { name: "linux-arm64", args: ["--linux", "AppImage", "tar.gz", "--arm64"] },
  { name: "win-x64", args: ["--win", "--x64"] },
];

const collected = [];
for (const target of targets) {
  const startedAt = Date.now();
  run(
    "npx",
    [
      "electron-builder",
      "--config",
      "electron-builder.nofeed2.yml",
      ...target.args,
      "--publish",
      "never",
    ],
    desktopDir,
  );
  collected.push(...harvest(target.name, startedAt - 1000));
}

// Android ships from a different toolchain; same source, same one command.
const androidStartedAt = Date.now();
run("npm", ["run", "build:apk:df"], root);
const apkDir = path.join(outRoot, "android-arm64-dogfood");
mkdirSync(apkDir, { recursive: true });
const apk = path.join(root, "artifacts/paseo-df-arm64.apk");
if (!existsSync(apk) || statSync(apk).mtimeMs < androidStartedAt - 1000) {
  throw new Error("the Android build did not refresh artifacts/paseo-df-arm64.apk");
}
copyFileSync(apk, path.join(apkDir, path.basename(apk)));
collected.push(path.join(apkDir, path.basename(apk)));

// ---- manifest ----
const lines = [
  `Paseo build ${stamp}`,
  `source: ${spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim()}`,
  "",
];
for (const file of collected.sort()) {
  const bytes = statSync(file).size;
  const sha = createHash("sha256").update(readFileSync(file)).digest("hex");
  lines.push(`${path.relative(outRoot, file)}\t${bytes}\t${sha}`);
}
writeFileSync(path.join(outRoot, "MANIFEST.txt"), `${lines.join("\n")}\n`);

process.stdout.write(`\n${collected.length} artifacts in ${outRoot}\nMANIFEST.txt written\n`);
