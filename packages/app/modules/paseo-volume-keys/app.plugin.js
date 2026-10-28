const { withMainApplication, withMainActivity } = require("expo/config-plugins");

const PACKAGE_LIST = "PackageList(this).packages.apply {";
const PACKAGE_REGISTRATION = "add(sh.paseo.volumekeys.PaseoVolumeKeysPackage())";

const ACTIVITY_CLASS = "class MainActivity : ReactActivity() {";
const KEY_DOWN_OVERRIDE = [
  "  // Observed, never consumed: volume keys still adjust the system stream.",
  "  // The JS audio lane mutes speech on a single volume-down and debounces",
  "  // rapid volume bursts; see src/audio/volume-mute.",
  "  override fun onKeyDown(keyCode: Int, event: android.view.KeyEvent?): Boolean {",
  "    sh.paseo.volumekeys.PaseoVolumeKeysModule.notifyKeyDown(keyCode)",
  "    return super.onKeyDown(keyCode, event)",
  "  }",
].join("\n");

function registerVolumeKeysPackage(contents) {
  if (contents.includes(PACKAGE_REGISTRATION)) return contents;
  if (!contents.includes(PACKAGE_LIST)) {
    throw new Error(
      "Could not register the volume-keys package: React Native's package list anchor is missing from MainApplication",
    );
  }
  return contents.replace(PACKAGE_LIST, `${PACKAGE_LIST}\n              ${PACKAGE_REGISTRATION}`);
}

function injectVolumeKeyDown(contents) {
  if (contents.includes("PaseoVolumeKeysModule.notifyKeyDown")) return contents;
  if (!contents.includes(ACTIVITY_CLASS)) {
    throw new Error(
      "Could not observe volume keys: the MainActivity declaration anchor is missing",
    );
  }
  return contents.replace(ACTIVITY_CLASS, `${ACTIVITY_CLASS}\n${KEY_DOWN_OVERRIDE}`);
}

module.exports = (config) =>
  withMainActivity(
    withMainApplication(config, (mod) => {
      mod.modResults.contents = registerVolumeKeysPackage(mod.modResults.contents);
      return mod;
    }),
    (mod) => {
      mod.modResults.contents = injectVolumeKeyDown(mod.modResults.contents);
      return mod;
    },
  );
module.exports.registerVolumeKeysPackage = registerVolumeKeysPackage;
module.exports.injectVolumeKeyDown = injectVolumeKeyDown;
