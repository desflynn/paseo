# Can the Mac Studio build a Windows installer of our custom Paseo build?

Repo: /Users/des/dev/paseo, branch `0.11.1-df` (HEAD 1d192524b). Read-only research, 2026-10-21.
Board ticket o1.3.

## Verdict (plain English)

**Yes, with caveats.**

1. The repo already carries a full Windows build config — NSIS + zip, x64 + arm64, unsigned — and upstream's own CI proves the exact build command works on a plain Windows box with Node 22 and no extra tooling. Nothing needs compiling: node-pty ships prebuilds for all six platforms and `npmRebuild: false`.
2. On the pinned electron-builder 26.8.1, exe icon/metadata stamping is done by **resedit, pure JavaScript** — the old "wine required to build Windows from macOS" rule no longer applies. NSIS and the Electron win32 dist auto-download at build time.
3. So the Studio can cross-build with one command and no installs: `npm run build:desktop -- --publish never --win --x64` (not run — read-only research).
4. Caveats: (a) the app ships with upstream's update feed baked in — build it with `-c.publish=null` or it will auto-update itself back to stock getpaseo; (b) a Mac `npm install` means the packaged daemon's **esbuild and sherpa binaries are darwin-only**, so plugin compilation and voice break if the Windows app uses its _embedded_ daemon — building on pcg5 instead removes this entirely; (c) the installer is unsigned, so both PCs get the SmartScreen "Run anyway" prompt — same as upstream's own Windows installers.

---

## 1. Does electron-builder support a win32 target from macOS, and what does it need?

**PROVED — config:**

- `packages/desktop/electron-builder.yml` (win block): `target: nsis` for x64 + arm64, `target: zip` for x64 + arm64, `artifactName: "Paseo-Setup-${version}-${arch}.${ext}"`, `icon: assets/icon.ico` (file exists, `packages/desktop/assets/icon.ico`), `extraResources: bin/paseo.cmd` (file exists, `packages/desktop/bin/paseo.cmd`). `nsis:` block: `oneClick: false`, `perMachine: false`, `allowToChangeInstallationDirectory: true`.
- No signing config in the win block. Top of file: `npmRebuild: false` — nothing native is rebuilt at package time; electron-builder just packs what npm installed.
- `packages/desktop/package.json:43`: `electron-builder: 26.8.1`; electron 44.2.0. The binary is installed in this checkout (`node_modules/.bin/electron-builder`, hoisted to root).
- Mac Studio state: node **v26.7.0**; `wine`, `wine64`, `makensis`, `osslsigncode` all **not installed** (checked with `which`); electron-builder present via repo node_modules. Nothing was installed (fence).

**PROVED — docs (v26, matching the pinned version):**

- electron-builder v26 Windows docs (electron.build/v26/docs/win): `win.signAndEditExecutable` — "Whether to sign and add metadata to executable via **resedit**" (a pure-JS PE resource editor; default true). `win.signExecutable: false` skips only signing. No wine anywhere in the v26 win docs (wine/Parallels appear only for the legacy AppX target, which we don't use).
- Signing is skipped in our case because there is no certificate anywhere: `grep CSC_ .github/workflows/` matches only `APPLE_CERTIFICATE` in the mac job.

**INFERRED:**

- The one-command cross-build `npm run build:desktop -- --publish never --win --x64` from the repo root produces `packages/desktop/release/Paseo-Setup-0.11.1-x64.exe` + `.zip`. Not run (read-only fence). First run needs internet: electron-builder auto-downloads NSIS (ships a macOS makensis build), winCodeSign helpers, and the Electron win32-x64 dist — a few hundred MB into its cache.
- wine/makensis/osslsigncode are **not needed** for this config on 26.8.1 — but this is the claim the trial must confirm (see NOT CONFIRMED).
- `scripts/after-sign.js` is darwin-only and gated on `PASEO_DESKTOP_SMOKE=1`; on Windows it returns immediately. `scripts/after-pack.js` is exercised per-platform by upstream CI on all three OSes.

## 2. Native modules and how the daemon is bundled

**PROVED:**

- `packages/server/package.json` runtime deps include exactly three platform-sensitive packages: `esbuild`, `node-pty`, `sherpa-onnx-node`. `sharp` and `workerd` are **not** used in server/cli/app source (grep: no imports).
- `node-pty` 1.2.0-beta.15 ships prebuilds for **all six platforms** in the one tarball — `darwin-arm64, darwin-x64, linux-arm64, linux-x64, win32-arm64, win32-x64` including `conpty.node` — and its install script exits 0 when the prebuild exists, so node-gyp never runs. Verified on this Mac checkout and on the DGX/pcg5 research: `des/dgx-headless/RECIPE-WINDOWS.md` §1.
- Bundling: the daemon is **inside the app asar** — `files:` includes `node_modules/@getpaseo/server` (`packages/desktop/electron-builder.yml`); `asarUnpack:` only `dist/daemon/node-entrypoint-runner.js` and the shell-integration scripts; `extraResources:` carries `../server/dist/server/builtin-plugins`, `../app/dist` (the UI) and `assets/editor-targets`. With `npmRebuild: false`, the asar contains whatever npm installed on the build machine.
- `esbuild` is used at runtime by the plugin compiler, lazily: `packages/server/src/server/plugins/compiler.ts:58-66` (`loadEsbuild()` → `nodeRequire("esbuild")`). esbuild's actual binary is a per-platform optional package (`@esbuild/win32-x64` — RECIPE-WINDOWS §1). `sherpa-onnx-node` is lazy-loaded too (voice only; RECIPE-WINDOWS §1).

**INFERRED (the main cross-build trap):**

- A Mac `npm install` installs `@esbuild/darwin-*` and the darwin sherpa binary; the win32 variants are absent from `node_modules`, so a **mac-cross-built installer would pack a daemon whose esbuild cannot run on Windows** → runtime plugin compilation breaks, and voice breaks. node-pty is unaffected (all-platform tarball).
- Upstream sidesteps this by building **on** Windows: `.github/workflows/desktop-release.yml`, job `publish-windows`, `runs-on: windows-latest`, plain Node 22, `npm ci`, then `npm run build:desktop -- --publish never --win --x64 --arm64`. On Windows, npm installs the win32 optional deps natively; no Visual Studio Build Tools step exists (nothing compiles).
- Today this trap is moot on pcg5: per `des/dgx-headless/RECIPE-WINDOWS.md`, the Windows app runs with `manageBuiltInDaemon: false` (default true, `packages/desktop/src/settings/desktop-settings.ts:38`) against an npm-installed daemon that resolves its own win32 natives.

## 3. Code signing / SmartScreen

**PROVED:**

- Our build would be **unsigned**, and so is upstream's: no win signing keys in `electron-builder.yml`, no `CSC_*`/certificate secrets in the `publish-windows` job (the mac job, by contrast, passes `CSC_LINK: secrets.APPLE_CERTIFICATE`), and `after-sign.js` does nothing off-mac.

**INFERRED (standard Windows 11 behaviour, not tested here):**

- An unsigned installer downloaded via a browser carries Mark-of-the-Web, so Defender SmartScreen shows "Windows protected your PC" on both PCs; the user clicks "More info" → "Run anyway". No administrative blocker; a private build never builds reputation, so the prompt is permanent. Upstream users see the same prompt. Edge/Chrome may also show a generic "not commonly downloaded" notice.

## 4. Auto-update

**PROVED:**

- `electron-builder.yml` publishes to `provider: github, owner: getpaseo, repo: paseo` — the **upstream** feed.
- The app ships `electron-updater ^6.6.2` (`packages/desktop/package.json`) and configures it in `packages/desktop/src/features/auto-updater.ts:147-155`: `autoDownload: true`, `autoRunAppAfterInstall: true`, channel `latest`/`beta`, `allowDowngrade: false`. Errors about a missing/unpublished channel are already swallowed as noise (`isUpdateChannelNotPublished`).
- `packages/desktop/package.json` version on our branch: **0.11.1**.

**INFERRED (standard electron-builder/electron-updater behaviour):**

- `--publish never` stops _publishing_, but the packaged app still embeds `app-update.yml` generated from the `publish:` config — so our custom Windows (or Mac) app would check getpaseo's releases, and when upstream's stable exceeds 0.11.1 (0.12 is in preparation — board o1.2), it would download and **run the stock upstream installer**, silently replacing our custom build.
- Fix is a build-time flag, no code change: add `-c.publish=null` to kill the feed (updater then reports channel errors that the code already tolerates), or repoint it at the fork with `-c.publish.owner=desflynn -c.publish.repo=paseo` and cut our own releases (each needs a `latest.yml` manifest to be a real feed). Note the Mac app built on 9 Oct presumably has the same hazard today.

## 5. Cheapest ways to deliver to Windows

**A. Cross-build on the Mac Studio.** `npm run build:desktop -- --publish never --win --x64 -c.publish=null`. No new tooling (resedit path, item 1). Cost: ~zero money; first build downloads a few hundred MB; wall time ≈ the mac desktop build the Studio already runs routinely. Risk: the esbuild/sherpa darwin-only caveat (item 2) — fine if the Windows PCs keep `manageBuiltInDaemon: false` and never compile plugins from the embedded daemon; wrong binaries otherwise.

**B. Build on pcg5 itself.** Exactly upstream's proven CI recipe, locally: git clone the fork, checkout `0.11.1-df`, `npm ci`, `npm run build:desktop -- --publish never --win --x64 -c.publish=null`. Node 22 is on pcg5 already (Volta — RECIPE-WINDOWS §1). Cost: ~5-10 min clone+install, ~10-20 min build (INFERRED). Removes the platform-binary caveat completely and produces the same artifact class upstream ships. Needs git on pcg5 (unverified).

**C. GitHub Actions on the desflynn/paseo fork.** `desktop-release.yml` supports `workflow_dispatch` with tag + `platform: windows` + `publish: false` → 7-day workflow artifacts (or `publish: true` → a draft GitHub Release). Free on a public repo. **Source exposure:** origin is already `https://github.com/desflynn/paseo.git` (public) and the branch's committed files include the `des/` worklogs, rollout runbooks and fleet facts (`git ls-files des/`: fleet-git-facts.md, authorized-rollout.sh, all overlay WORKLOGs, PAUSED-AGENTS.json, etc.), plus ~35 modified/untracked entries in the working tree. Pushing the branch publishes all of that. The overlay patches themselves are diffs of already-public upstream code — the internal notes are the sensitive part. Actions must also be enabled in the fork's UI once.

**D. Keep the daemon-side overlay recipe only (today's route).** Stock upstream Windows app + `npm install -g` the seven Mac-built tarballs + scheduled task + `manageBuiltInDaemon: false` Direct connection (RECIPE-WINDOWS). A full custom installer adds over D:

1. our `0.11.1-df` desktop shell/renderer instead of stock — though all ten current overlays are daemon-side, so nothing visible changes today (RECIPE-WINDOWS "short version");
2. an embedded `0.11.1-df` daemon for app-managed mode (worthwhile only once item 2's caveat is solved, i.e. built on Windows);
3. one installer per PC instead of the npm/Volta/scheduled-task dance;
4. a controlled update path (`-c.publish` at our fork or null) instead of the stock app silently self-updating to upstream builds;
5. the `bin/paseo.cmd` CLI shipped in the app resources.

Ranking for two PCs, one-off: **B** is cheapest and cleanest (proves and produces on-target); **A** is worth one trial as the standing no-Windows-boot route; **C** only if Des wants repeatable CI and accepts the public des/ exposure; **D** remains the proven fallback and already works.

## 6. Serving the download

**INFERRED (not run):** simplest is Python's built-in server plus the Tailscale that already links the fleet — on the Studio:

```sh
mkdir -p ~/paseo-dist && cp packages/desktop/release/Paseo-Setup-*.exe ~/paseo-dist/
cd ~/paseo-dist && python3 -m http.server 8085 --bind 127.0.0.1
tailscale serve --bg 8085     # https://<studio>.<tailnet>.ts.net on both PCs' browsers
```

Zero installs (python3 ships with macOS). For two machines, honestly even simpler: `scp` the .exe to each PC and skip the server entirely.

## Cheapest next step to prove it

On the Studio, in `/Users/des/dev/paseo` (branch `0.11.1-df`):

```sh
npm run build:desktop -- --publish never --win --x64 -c.publish=null
```

Cost: ~15-40 min CPU, a few hundred MB of build-time downloads (NSIS + Electron win32 dist), no new tooling. Success = `packages/desktop/release/Paseo-Setup-0.11.1-x64.exe` exists. Then install on ONE Windows PC (or a VM) and smoke: app opens, connects, SmartScreen prompt appears and is passable. If the PCs will ever run plugins from the embedded daemon, repeat the same commands on pcg5 (option B) and use that artifact instead.

## NOT CONFIRMED

- That the mac cross-build actually completes with no wine on electron-builder 26.8.1 (docs say resedit; no trial run — read-only fence).
- That the produced installer installs and runs correctly on Windows 11 (nsis `perMachine: false` user-install flow untested).
- Exact effect of `-c.publish=null` on `app-update.yml` generation and on this app's update UI (code tolerates channel errors, but untested).
- Whether the embedded daemon ever loads esbuild on the Windows PCs (depends on plugin use and `manageBuiltInDaemon` per PC).
- Upstream's current latest stable version (no release-feed query was made); assumed ≥ 0.11.1 risk because 0.12 is in preparation.
- git present on pcg5 (Node/Volta is proved; git is not).
- NSIS macOS binary availability inside electron-builder 26.8.1's auto-download (standard behaviour, not verified on disk).
