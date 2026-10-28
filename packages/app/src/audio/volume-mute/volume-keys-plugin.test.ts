import { beforeAll, describe, expect, it } from "vitest";

interface VolumeKeysPlugin {
  registerVolumeKeysPackage(contents: string): string;
  injectVolumeKeyDown(contents: string): string;
}

// The config plugin is plain JS (Expo loads it with node at prebuild), so it
// carries no type exports; the transforms are cast here and tested as strings.
let registerVolumeKeysPackage: VolumeKeysPlugin["registerVolumeKeysPackage"];
let injectVolumeKeyDown: VolumeKeysPlugin["injectVolumeKeyDown"];

beforeAll(async () => {
  const plugin =
    (await import("../../../modules/paseo-volume-keys/app.plugin")) as unknown as VolumeKeysPlugin;
  registerVolumeKeysPackage = plugin.registerVolumeKeysPackage;
  injectVolumeKeyDown = plugin.injectVolumeKeyDown;
});

const mainApplication = [
  "class MainApplication : Application(), ReactApplication {",
  "  override fun getPackages(): List<ReactPackage> =",
  "    PackageList(this).packages.apply {",
  "      // Packages that cannot be autolinked yet can be added manually here, for example:",
  "      // add(MyReactNativePackage())",
  "    }",
  "}",
].join("\n");

const mainActivity = [
  "package sh.paseo.df",
  "",
  "import android.os.Bundle",
  "",
  "import com.facebook.react.ReactActivity",
  "import com.facebook.react.ReactActivityDelegate",
  "",
  "class MainActivity : ReactActivity() {",
  "  override fun onCreate(savedInstanceState: Bundle?) {",
  "    super.onCreate(null)",
  "  }",
  "}",
].join("\n");

describe("paseo-volume-keys plugin", () => {
  it("registers the package in MainApplication", () => {
    const out = registerVolumeKeysPackage(mainApplication);
    expect(out).toContain("add(sh.paseo.volumekeys.PaseoVolumeKeysPackage())");
    expect(out.indexOf("add(sh.paseo.volumekeys")).toBeGreaterThan(
      out.indexOf("PackageList(this).packages.apply {"),
    );
  });

  it("is idempotent on the package registration", () => {
    const once = registerVolumeKeysPackage(mainApplication);
    expect(registerVolumeKeysPackage(once)).toBe(once);
  });

  it("throws when the package-list anchor is missing", () => {
    expect(() => registerVolumeKeysPackage("class MainApplication {}")).toThrow(
      /package list anchor is missing/,
    );
  });

  it("injects the key-down observer into MainActivity without consuming the key", () => {
    const out = injectVolumeKeyDown(mainActivity);
    expect(out).toContain(
      "override fun onKeyDown(keyCode: Int, event: android.view.KeyEvent?): Boolean",
    );
    expect(out).toContain("sh.paseo.volumekeys.PaseoVolumeKeysModule.notifyKeyDown(keyCode)");
    expect(out).toContain("return super.onKeyDown(keyCode, event)");
    expect(out.indexOf("override fun onKeyDown")).toBeGreaterThan(
      out.indexOf("class MainActivity : ReactActivity() {"),
    );
  });

  it("is idempotent on the key-down injection", () => {
    const once = injectVolumeKeyDown(mainActivity);
    expect(injectVolumeKeyDown(once)).toBe(once);
  });

  it("throws when the MainActivity anchor is missing", () => {
    expect(() => injectVolumeKeyDown("class OtherActivity {}")).toThrow(
      /MainActivity declaration anchor is missing/,
    );
  });
});
