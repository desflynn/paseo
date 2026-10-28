import { spawnSync, execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const target = process.argv[2] ?? "universal";
const architectures = {
  universal: "armeabi-v7a,arm64-v8a,x86,x86_64",
  arm64: "arm64-v8a",
}[target];
if (!architectures) {
  throw new Error(`Unknown APK target: ${target}. Use universal or arm64.`);
}

const root = fileURLToPath(new URL("..", import.meta.url));
const app = path.join(root, "packages/app");
// Expo config variant: production replaces the store app, dogfood installs
// beside it as "PaseoDF". Defaults to production for the shipping artifact.
const appVariant = process.env.APP_VARIANT ?? "production";
const env = {
  ...process.env,
  APP_VARIANT: appVariant,
  PASEO_WATCHDOG_BUILD: "1",
  PASEO_DIAGNOSTIC_BUILD_TIME: new Date().toISOString(),
  PASEO_DIAGNOSTIC_REVISION:
    execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim() +
    (execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim()
      ? "-dirty"
      : ""),
};
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run("npm", ["run", "build:app-deps"], root);
// --clean: the package id, app name and icon come from the Expo config, and
// prebuild will not rewrite an android/ tree that already exists for another
// variant, so a stale tree would ship the previous variant's identity.
run("npx", ["expo", "prebuild", "--platform", "android", "--clean", "--no-install"], app);
// Gradle does not track Metro's environment flags. Always regenerate the JS artifact
// so a previous ordinary release cannot silently bypass the profiling renderer.
rmSync(path.join(app, "android/app/build/generated/assets"), { recursive: true, force: true });
run(
  "./gradlew",
  [
    "assembleRelease",
    "--no-daemon",
    "--max-workers=2",
    "-Dorg.gradle.parallel=false",
    `-PreactNativeArchitectures=${architectures}`,
  ],
  path.join(app, "android"),
);
const artifactStem = appVariant === "dogfood" ? "paseo-df" : "paseo-dogfood";
const destination = path.join(root, `artifacts/${artifactStem}-${target}.apk`);
mkdirSync(path.dirname(destination), { recursive: true });
copyFileSync(path.join(app, "android/app/build/outputs/apk/release/app-release.apk"), destination);
console.log(`\nDiagnostic release APK: ${destination}\nLogs: Downloads/Paseo diagnostics\n`);
