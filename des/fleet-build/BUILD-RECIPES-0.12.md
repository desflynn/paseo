# Build recipes for the 0.12.0-df desktop apps (2026-10-21)

Built on the Mac Studio from branch `0.12.0-df` in a separate worktree. Nothing was installed. Both builds ran under a watchdog that kills the build if free disk drops too low, because the data volume sat at 99%.

## Worktree

```bash
git worktree add -b 0.12.0-df /Users/des/dev/paseo-0.12.0-df v0.12.0
# seed des/, .agents, .claude, .flight*, .codex, .pi, CLAUDE.md and .gitignore from 0.11.1-df
# then apply the ten patches in des/overlays/README.md order
cd /Users/des/dev/paseo-0.12.0-df && npm ci
```

`npm ci` ends with one blocked install script: `react-native-enriched-markdown` (its postinstall downloads native assets). It is not approved. The Electron web export does not need it. An Android build will.

## Mac build (zip only, arm64)

```bash
npm run build:desktop -- --publish never --mac zip --arm64
```

Output: `packages/desktop/release/Paseo-0.12.0-arm64.zip` (179 MB). The DMG target was skipped to save disk. The bundled `app-update.yml` still points at upstream `getpaseo/paseo`; an unsigned Mac app cannot apply an update, same as 0.11.1-df.

## Windows build (x64 NSIS and zip, no update feed)

Run it after the Mac build, from `packages/desktop`, so the already-built `dist` is reused. Do not pass `-c.publish=null`; it may arrive as the string "null". Use a child config that extends the real one:

```yaml
# /tmp/phg-win/electron-builder.win-nofeed.yml
extends: /Users/des/dev/paseo-0.12.0-df/packages/desktop/electron-builder.yml
publish: null
```

```bash
npx electron-builder --config /tmp/phg-win/electron-builder.win-nofeed.yml --win nsis zip --x64 --publish never
```

Proved with electron-builder's own config resolver: the child resolves to `publish: null` and inherits everything else. The built Windows app has no `app-update.yml`, so it cannot self-update to stock.

Output: `Paseo-Setup-0.12.0-x64.exe` (156 MB) and `Paseo-Setup-0.12.0-x64.zip` (210 MB).

## Caveats

- Unsigned. The PE certificate table is empty, so Windows SmartScreen shows "run anyway".
- The Windows bundle packs darwin-only `esbuild`, `sherpa-onnx` and `msgpackr-extract`. Its embedded daemon cannot compile plugins or run voice. Use `manageBuiltInDaemon: false` against an external daemon (`des/dgx-headless/RECIPE-WINDOWS.md`), or build on pcg5 itself.
- x64 only. No ARM Windows build was made.
- Android: not built. See `ANDROID-OVER-ADB.md`.
