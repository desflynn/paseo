# Paseo custom mobile build, deployed over ADB — feasibility (board ticket o1.4)

Repo `/Users/des/dev/paseo`, branch `0.11.1-df` @ `1d192524b` (from `git branch --show-current` / `git log -3 --oneline`; working tree holds untracked notes only). Research date 2026-10-21, strictly read-only.

## Verdict (plain English)

**YES WITH CAVEATS.**

1. The repo ships a complete, documented local-build route that never touches EAS cloud: `npm run android:development` / `android:production` (expo prebuild + `expo run:android`), and `PASEO_FDROID_BUILD=1` for a fully source-built APK.
2. The Mac Studio lacks the Android toolchain today: no `adb`, no `ANDROID_HOME`, mise has Java 17 (the repo pins 21), and the only android-sdk installs are the ancient `1.0`/`latest` bundles that `docs/android.md` explicitly warns against. One `mise install` + `sdkmanager` session (~2 GB disk) fills the gap.
3. A self-signed APK cannot update the Play Store app in place — the Play key is EAS-managed and not held locally. The `sh.paseo.debug` variant ("Paseo Debug") installs beside the Play app cleanly, with no data loss.
4. Repo notes say Des's mobile app is an **App Store install** — if the phone is an iPhone, the route is Xcode (26.6 already installed) plus developer signing, not ADB at all.

---

## 1. The local build route (no EAS cloud)

**PROVED** — `packages/app/package.json` scripts, `docs/android.md`:

- `npm run android:development` = `npm --prefix ../.. run build:client && cross-env APP_VARIANT=development expo prebuild --platform android --clean --non-interactive && cross-env APP_VARIANT=development expo run:android --variant=debug`.
- `npm run android:production` = the same with `APP_VARIANT=production` and `--variant=release`.
- `npm run android:clear` removes the generated `android/` folder. It is generated on demand — confirmed: **no** `packages/app/android` exists today.
- Cleanest self-signed artifact: the F-Droid source build — `PASEO_FDROID_BUILD=1 APP_VARIANT=production npx expo prebuild --platform android --clean --non-interactive`, then `PASEO_FDROID_BUILD=1 ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon --max-workers=1 -Dorg.gradle.parallel=false` (`docs/android.md` § F-Droid). The build must run serial: parallel Gradle workers exhaust memory and Hermes dies with exit 137 (documented gotcha). The flag must be set for **both** prebuild and Gradle, because Gradle starts Metro for the release bundle. The resulting app supports direct and pasted-link pairing, but no QR scanning and no push notifications.
- `eas build --local` would also work (`eas.json` has a `production-apk` profile: `distribution: internal`, `buildType: apk`), but the repo's own script route is simpler and already documented.

**Environment needed** — **PROVED** from `.tool-versions`, `.mise.toml` (repo root) and `docs/android.md` § Prerequisites:

| Tool                      | Pinned version                                                                                                                                                                         | Source                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Java (JDK)                | **21**                                                                                                                                                                                 | `.tool-versions`                |
| Android SDK cmdline-tools | **21.0** — mise derives `ANDROID_HOME` = `~/.local/share/mise/installs/android-sdk/21.0`                                                                                               | `.tool-versions` + `.mise.toml` |
| SDK packages              | `platform-tools`, `platforms;android-35`, `build-tools;35.0.0`; Gradle auto-fetches the rest once licences are accepted                                                                | `docs/android.md`               |
| Node                      | 22.20.0 — **already installed** under mise (verified `~/.local/share/mise/installs/node/22.20.0`)                                                                                      | `.tool-versions`                |
| Expo / RN                 | expo `^54.0.18`, react-native `0.81.5`, react `19.1.0` (lockstep — bumping React alone crashes Android startup, `docs/android.md` § React version lockstep), expo-dev-client `^6.0.15` | `packages/app/package.json`     |

**INFERRED (standard RN requirement):** RN 0.81 / AGP 8.x needs JDK 17+; the repo pins 21, so use 21.

## 2. What is on the Mac Studio now (read-only probe)

**PROVED** by direct probes this session (host `Desmonds-Mac-Studio.local`, macOS 26.2, arm64):

- `which adb` → **not installed**. `ANDROID_HOME` → **empty**. `~/Library/Android/sdk` → **does not exist**.
- `/usr/bin/java` exists but is the macOS **stub — no JRE** ("Unable to locate a Java Runtime").
- mise **is** installed (`/opt/homebrew/bin/mise`, 2026.7.5). Installs present: `java 17.0.2` (repo pins **21** — needs install); `android-sdk` only as `1`, `1.0`, `latest` — all the **ancient cmdline-tools-only bundle** that `docs/android.md` § Prerequisites warns against (sdkmanager 3.6.0, no platform-tools/emulator). The pinned `21.0` is **not** installed.
- Node 22.20.0 present under mise ✓ (matches the pin). Xcode 26.6 present ✓ (matters only for the iPhone route).

Nothing was installed, per the task fence.

## 3. App variants and signing

**PROVED** — `packages/app/app.config.js` variants, `docs/android.md` § App variants:

| Variant                    | App name    | applicationId    |
| -------------------------- | ----------- | ---------------- |
| `production` (Play build)  | Paseo       | `sh.paseo`       |
| `development` (dev client) | Paseo Debug | `sh.paseo.debug` |

- **Beside-install (recommended):** `sh.paseo.debug` installs next to the Play Store `sh.paseo`. Different applicationId, no conflict; the Play install and its data stay untouched. Two icons on the phone.
- **Replace the Play app in place: not possible with our own key.** **PROVED:** `docs/android.md` § Cloud build — "Android auto-submits to the Play Store via **EAS-managed credentials**", so the Play signing key lives in Expo's cloud, not on the Mac. **PROVED repo-side:** no keystore credentials exist in the repo (`app.config.js` references only optional google-services secret files under `./.secrets/`). Standard Android behaviour (**INFERRED**, universal platform rule): an APK signed with a different key than the installed app is refused as an update (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`). Installing our self-signed `sh.paseo` over the Play app therefore requires uninstalling first — which **wipes app data: pairing, settings, accounts**.
- **Keystore handling:** builds from `expo run:android` sign with the debug keystore that expo prebuild generates in `android/app/debug.keystore` (**INFERRED — standard Expo template behaviour; confirm at first build**). A durable personal release key can be generated later and wired into the generated gradle; for this feasibility answer a debug-signed APK is enough. A debug-signed `sh.paseo.debug` is a normal daily-driver app — only the signing key is "debug", nothing else differs.

## 4. Wireless ADB — Android 11+ phone (written for Des)

Standard Android platform procedure (**INFERRED** — generic Android 11+ behaviour, not repo-specific; the repo confirms `adb install` is the deploy path via `expo run:android`):

One-time setup on the phone:

1. Settings → About phone → tap **Build number** 7× to unlock Developer options.
2. Settings → Developer options → enable **Wireless debugging**. (Leave USB debugging off if you prefer wireless-only.)

Pair, once per phone: 3. Tap **Wireless debugging** → **Pair device with pairing code**. The phone shows an IP:port and a 6-digit code. 4. On the Mac: `adb pair <ip:port>` → type the 6-digit code when asked. 5. `adb connect <ip:port>` — this connect port differs from the pair port; both are on the Wireless debugging screen.

Install and update the app: 6. `adb install -r /path/to/paseo-debug.apk`. `-r` keeps app data on reinstalls **of the same signing key**. 7. `adb devices` should list the phone; then just open Paseo Debug.

USB alternative: cable the phone, tap **Allow USB debugging** on the prompt, `adb devices`, `adb install -r <apk>`. USB is the more reliable first run. Wireless debug survives reboots, but its connect port can change — re-run `adb connect` when it does.

Every command above needs the toolchain from item 2 installed first.

## 5. How the app reaches the daemon; protocol limits

**PROVED:**

- Two connection modes exist: **relay pairing** (E2E-encrypted, `packages/relay`, threat model in `SECURITY.md`) and **direct** host:port (`docs/mobile-testing.md`: "Prefer direct connection… direct needs `127.0.0.1:6767`").
- Dev/debug builds bake the daemon endpoint at bundle time: `EXPO_PUBLIC_LOCAL_DAEMON` (`packages/app/src/runtime/host-runtime.ts`, default `localhost:6767`), documented in `docs/android.md` § emulator and `docs/development.md`. Set it on the build command, e.g. the Mac's Tailscale IP and port.
- Production-style builds pair through the app UI (direct host:port or relay URL) — no rebuild needed to point at a daemon.
- **Protocol limits:** `docs/protocol-compatibility.md` — the wire contract is **always backward-compatible both ways** (old app parses new daemon and vice versa; new fields optional, never narrowed, never removed). Features beyond the wire are gated per-feature on `server_info.features.*`: the app checks the capability and tells you to update the host, instead of breaking. Our custom app and the `-df` daemon come from the **same checkout** (`0.11.1-df`), so they match by construction.

**INFERRED:** direct connection over Tailscale (phone on the tailnet → `<tailscale-ip>:6767`) works, because direct mode is plain host:port; the repo docs never name Tailscale explicitly.

## 6. Do the des/ overlays touch packages/app?

**PROVED: no.**

- `grep -rln 'packages/app' des/overlays/` → **zero matches**. The overlay list (acp-context-meter, claude-auto-compact-window, claude-stale-subagent, mine-label, pi-compaction-\*, pi-mcp-labels, pi-worktree-trust, reload-wait, sub-label, unsigned-macos-build) targets the daemon, agent CLI harnesses and the desktop build. `des/overlays/README.md`: overlays exist "to build our `X.Y.Z-df` **desktop** app", and plugins "are not patches to Paseo code".
- So a custom mobile build carries **nothing** from overlays.

**PROVED — the semantic-markdown plugin does not go in the app bundle:** `docs/plugins.md` — "Only the daemon reads plugin files and acquires sources"; plugin **client bundles are served to the app by the daemon** through the plugin catalog. The plugin (`des/plugins/semantic-markdown/paseo-plugin.json`, requires `paseo >= 0.9.2` — 0.11.1 satisfies it) renders in any app that speaks the protocol, including a locally-built one.

- **Hermes facts (PROVED from plugin notes):** `des/plugins/semantic-markdown/build.mjs` — plugin client bundles "skip Metro, so Hermes would see raw `class` syntax"; the plugin prebundles and Babel-lowers its own code for Hermes (`unstable_transformProfile: "hermes-stable"`), against the "0.9.2 mobile Hermes" engine. `WORKLOG.md`: the Mac hermes CLI "is NOT a phone stand-in" (segfaults on classes; Proxy stubs break namespace copies) — plugin testing used a real phone. A locally-built app on RN 0.81.5 runs the same Hermes generation the plugin was already lowered for, so the plugin behaves the same.

## 7. What is Des's phone — do NOT assume

**What the repo notes say (PROVED as notes, not as fact about the phone):**

- `.dci/worklogs/69b2e220-7e98-4aed-ab15-b92069741f52.md`: "the same broken rendering is on Des's mobile app, **an App Store install**". `.dci/observations.jsonl`: "Des's mobile app (**App Store install**, unreachable by app-side overlay)". App Store ⇒ **iPhone**.
- Plugin notes mention **Android Hermes** testing ("0.9.2 mobile Hermes") — that is the plugin team testing against the Hermes engine on mobile generally (Hermes is the RN engine on iOS too), not proof Des carries an Android.

**If the phone is an iPhone (the App Store case):** the equivalent route is Xcode, which is installed (26.6):

```
cd packages/app
npm --prefix ../.. run build:client
APP_VARIANT=development npx expo prebuild --platform ios
APP_VARIANT=development npx expo run:ios --device
```

(`docs/mobile-testing.md` § Local iOS device builds — **PROVED**. `APP_VARIANT=development` is required, or you build `sh.paseo` and collide with the App Store install.) Caveats, **PROVED** from the same doc: Xcode needs the Apple ID's `Xcode-Token` in the keychain (a fresh sign-in fixes the misleading "No Accounts" failure); a human must hold the phone — headless `devicectl` launches die with exit 0 when the screen is off. **INFERRED (standard Apple rules):** a free Apple ID sideload expires after **7 days** and caps at **3 apps**; a paid Apple Developer account (€99/yr) signs for a year. No ADB — install goes through Xcode / `devicectl` over USB or Wi-Fi.

**This item ends as a question for Des** (see Questions).

---

## Cheapest first trial (not run — fence)

```bash
cd /Users/des/dev/paseo && mise install java android-sdk && mise exec -- adb version
```

- **Cost:** ~10–20 minutes, ~1–2 GB disk, fully local, reversible (`mise uninstall java android-sdk`).
- **Proves:** the repo-pinned JDK 21 + android-sdk 21.0 land cleanly on arm64 macOS 26, and `adb` becomes available through mise — the only hard blocker on the Mac side. The next cheap trial after that: `sdkmanager "platform-tools" "build-tools;35.0.0"`, then one `npm run android:development` with the phone cabled.

## NOT CONFIRMED

- Release-build signing default: whether the prebuilt release APK signs with the generated debug keystore without extra config (standard Expo behaviour, not stated in repo docs). Confirm at first build.
- Des's phone OS, model and Android version. Wireless debugging exists only on Android 11+; the App Store notes say iPhone, but he has not confirmed.
- Whether a Tailscale direct connection from the phone app works in practice (mechanism proved, route not exercised).
- Gradle memory headroom on the Studio for the serial F-Droid build (docs document exit-137 OOM on parallel builds).
- Whether the EAS-managed Play key could ever be pulled from the Expo account (not needed for the debug-beside route).

## Questions for Des

1. **Which phone is the Paseo app on — iPhone (App Store) or Android?** Repo notes say App Store install; plugin notes mention Android Hermes testing. Everything in §4 depends on the answer.
2. **If Android:** install "Paseo Debug" (`sh.paseo.debug`) **beside** the Play app (recommended, no data loss), or is replacing the Play app acceptable knowing pairing/settings are wiped (our key ≠ Play key)?
3. **If iPhone:** is a free Apple ID acceptable (app expires every 7 days, must be re-signed from the Mac), or does he have or want a paid developer account (1-year signing)?
4. **Daemon reach from the phone:** Tailscale direct (`<tailscale-ip>:6767`) or the relay? Direct is simplest at home; relay is the anywhere option.
