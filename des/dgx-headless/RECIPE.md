# Paseo daemon and CLI, headless on DGX Spark

Answer to KLV Head Guy, board o10. Fork `desflynn/paseo`, branch `0.11.1-df`.

Read-only research. Nothing was built or changed on the DGX. The Mac daemon was
not touched. Every "proved" line was run on the Mac against the 0.11.1-df tree
with a throwaway `PASEO_HOME` under `/tmp`.

## The short version

Do not build on the DGX. Build `dist` on the Mac, pack it, and install the
tarballs on the DGX with plain system Node. Never run `npm run build:desktop` for
this. That is Expo plus electron-builder, and a daemon does not need it.

Upstream already does this for Docker. `docker/base/Dockerfile` packs seven
workspaces (lines 19-27), installs them globally (line 56), and runs
`node "$entry"` (line 77). This recipe follows that, so the approach is not
invented.

## 1. Daemon and CLI on plain system Node

Yes. Proved, and Electron is not involved.

- `packages/server/package.json` `scripts.start` is
  `node dist/scripts/supervisor-entrypoint.js`.
- `packages/cli/bin/paseo` is `#!/usr/bin/env -S node ...` importing `../dist/index.js`.
- The CLI spawns the daemon with `command: process.execPath`
  (`packages/cli/src/commands/daemon/local-daemon.ts:56`), so the daemon inherits
  whichever Node ran the CLI. Under Electron that is the Electron binary. Under
  system Node it is system Node.
- `bin/paseo` in the desktop bundle is the Electron trampoline. It exists to
  reuse Electron's bundled Node, so we skip it.

Proof. With `PASEO_HOME=/tmp/dgx-proof-home` and `PASEO_LISTEN=127.0.0.1:6799`,
`node packages/server/dist/scripts/supervisor-entrypoint.js` came up and served.
Then `node packages/cli/dist/index.js --host 127.0.0.1:6799 daemon status`
reported `daemonVersion: 0.11.1`, `connectedDaemon: reachable`, and
`daemonNode: /opt/homebrew/Cellar/node/26.7.0/bin/node`. That last field is the
proof. Check it on the DGX too.

Build these seven workspaces, the same set the Dockerfile packs: `protocol`,
`client`, `highlight`, `relay`, `plugin`, `server`, `cli`. That is
`npm run build:server`. You do not need `app`, `desktop`, `website`, or
`expo-two-way-audio`. That is the Expo tree, and it is the part that would melt
the box.

## 2. Native modules on linux-arm64

Three matter. All three ship linux-arm64 prebuilts, so `npm install` on the DGX
compiles nothing.

| Module                     | arm64 status                                                  | Cost                                                        |
| -------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| `node-pty` 1.2.0-beta.15   | `prebuilds/linux-arm64/pty.node` (69 KB) ships in the tarball | none; `scripts/prebuild.js` exits 0, so node-gyp never runs |
| `sherpa-onnx-node` 1.12.28 | optional dep `sherpa-onnx-linux-arm64` is declared            | one download; loaded only if local speech runs              |
| `@esbuild/linux-arm64`     | standard esbuild optional dep                                 | about 10 MB, install time only                              |

Notes.

- Speech is lazy. `loadSherpaOnnxNode()` is called from the VAD, TTS and
  recogniser classes, not from `bootstrap.ts`. A broken sherpa breaks voice, not
  boot. But the daemon does start model downloads at boot by default, which is
  wasted disk and network on a headless box. Turn it off, see section 5.
- `bcryptjs` is pure JS, so password auth needs no compiler.
- There is no sqlite and no ALSA or portaudio dependency in the server tree.
- `node-pty` sits under `packages/server/node_modules`, not the root. Expect a
  nested install.
- Default speech does download models at boot. With the config in section 5.5 it
  does not, which was proved.

## 3. Do the overlays live in the daemon?

Yes. Ten patches in `des/overlays/`, and every one is server-side.

| Overlay                      | Lives in                               | Headless                                  |
| ---------------------------- | -------------------------------------- | ----------------------------------------- |
| `unsigned-macos-build`       | `package.json`, `packages/desktop`     | macOS packaging only, irrelevant on Linux |
| `mine-label`                 | `packages/server`                      | yes                                       |
| `sub-label`                  | `packages/server`                      | yes                                       |
| `reload-wait`                | `packages/server`                      | yes                                       |
| `pi-compaction-hold`         | `packages/server`                      | yes                                       |
| `pi-compaction-status`       | `packages/server`                      | yes                                       |
| `pi-worktree-trust`          | `packages/server`                      | yes                                       |
| `pi-mcp-labels`              | `server`, `protocol`, one app e2e spec | yes, the app file is a Playwright test    |
| `claude-stale-subagent`      | `packages/server`                      | yes                                       |
| `claude-auto-compact-window` | `packages/server`                      | yes                                       |

Proved from the packed tarball: `MINE` is in the packed `session.js`,
`workspace-labels/sub-label.js` is present, `waitForAgentReload` is in the packed
`agent-manager.js`, `--approve` is in `pi/cli-runtime.js`, and
`autoCompactWindow` is in `claude/agent.js`.

So a headless daemon from this branch behaves like the Mac's daemon. It does not
give you the desktop window, but the desktop is an Electron shell over the same
daemon. The app talks to the daemon over the network, so from the Mac app or the
ideaPad the DGX daemon looks identical.

## 4. Build cost, and building on the Mac

Build on the Mac and ship tarballs. TypeScript emits JS. The only arch-specific
things are the three natives, and they come from `npm install` on the target, not
from `tsc`.

Measured on the Mac, cold, writing to `/tmp`:

| Package   | Wall  | Peak RSS |
| --------- | ----- | -------- |
| server    | 9.9 s | 2.1 GB   |
| protocol  | 6.0 s | 1.1 GB   |
| client    | 4.4 s | 1.0 GB   |
| cli       | 2.2 s | 0.76 GB  |
| plugin    | 1.4 s | 0.50 GB  |
| relay     | 0.9 s | 0.33 GB  |
| highlight | 0.9 s | 0.34 GB  |

About 26 s wall and 2.1 GB peak for the set. The DGX would be slower, and with
15 GB free and live models that spike is what you do not want there.

The built output is pure JS. A `find` over all seven `dist` trees returns zero
`.node`, `.so` or `.dylib` files. So `dist` is portable; only `node_modules` is
not.

## 5. The recipe

Steps 1 and 2 on the Mac, steps 3 to 7 on the DGX.

### 1. Mac: build

```bash
cd /Users/des/dev/paseo
git switch 0.11.1-df
npm ci                 # only if node_modules is stale
npm run build:server   # client, highlight, plugin, relay, server, cli
```

Do not run `build:desktop`.

### 2. Mac: pack and copy

```bash
rm -rf /tmp/dgx-packs && mkdir -p /tmp/dgx-packs
for w in protocol client highlight relay plugin server cli; do
  npm pack --workspace=@getpaseo/$w --pack-destination /tmp/dgx-packs --ignore-scripts
done
scp /tmp/dgx-packs/*.tgz dgx:/tmp/
```

Seven tarballs, 3.1 MB total. `--ignore-scripts` matters. Without it npm runs
`prepack`, which rebuilds everything and bundles the web UI for nothing.

### 3. DGX: install, no compiler

The DGX already has Node 26.8.1, which is fine. The only hard requirement is
22.18 or newer, for the `-S` shebang and modern `node:` builtins. If you ever
need a user-level Node:

```bash
mkdir -p ~/.local/node && cd ~/.local/node
curl -fsSLO https://nodejs.org/dist/v22.20.0/node-v22.20.0-linux-arm64.tar.xz
tar xf node-v22.20.0-linux-arm64.tar.xz --strip-components=1
export PATH="$HOME/.local/node/bin:$PATH"
```

Install the tarballs into a user prefix. No sudo.

```bash
npm config set prefix ~/.local
npm install -g /tmp/dgx-packs/*.tgz
which paseo
ls ~/.local/lib/node_modules/@getpaseo/server/dist/scripts/supervisor-entrypoint.js
```

`npm install -g` resolves the three natives for linux-arm64 from the registry.
Watch the log for `node-gyp rebuild`. If it appears, a prebuild is missing. Stop
and tell KLV rather than letting it compile on that box.

### 4. DGX: the shim

The global install writes `~/.local/bin/paseo`, already a plain-Node launcher.
Nothing else is needed. If you want an explicit one:

```bash
cat > ~/.local/bin/paseo-dgx <<'EOF'
#!/bin/sh
exec node "$HOME/.local/lib/node_modules/@getpaseo/cli/dist/index.js" "$@"
EOF
chmod +x ~/.local/bin/paseo-dgx
```

### 5. DGX: config

Write `~/.paseo/config.json` before the first start. Keep speech off. The box is
headless, has no microphone, and the default starts model downloads at boot.

```json
{
  "daemon": {
    "listen": "0.0.0.0:6767",
    "mcp": { "injectIntoAgents": true }
  },
  "features": {
    "dictation": { "enabled": false },
    "voiceMode": { "enabled": false }
  }
}
```

Proved: with exactly this file the daemon logged all four speech providers as
`unavailable` and started **zero** downloads, and still listened normally. The
keys are `features.dictation.enabled` and `features.voiceMode.enabled`, both in
the strict `persisted-config.ts` schema, so a typo would be rejected rather than
silently ignored.

Set a password before binding `0.0.0.0`, with `paseo daemon set-password` or
`PASEO_PASSWORD` in the unit environment. It is a startup setting, so do it on
the first start.

### 6. DGX: systemd user unit

`loginctl enable-linger` is required, or the unit dies when you log out.

```bash
loginctl enable-linger "$USER"

mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/paseo.service <<'EOF'
[Unit]
Description=Paseo daemon (0.11.1-df, headless)
After=network-online.target

[Service]
Type=simple
Environment=NODE_ENV=production
Environment=PASEO_HOME=%h/.paseo
Environment=PASEO_LISTEN=0.0.0.0:6767
Environment=PASEO_LOG_FORMAT=json
ExecStart=/usr/bin/env node %h/.local/lib/node_modules/@getpaseo/server/dist/scripts/supervisor-entrypoint.js
Restart=always
RestartSec=5
KillMode=mixed
TimeoutStopSec=30

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now paseo
systemctl --user status paseo --no-pager
journalctl --user -u paseo -f
```

The supervisor respawns its own worker, so restart only for a version change.
Upgrade is: install the new tarballs, then `systemctl --user restart paseo`.

### 7. DGX: prove it

```bash
node ~/.local/lib/node_modules/@getpaseo/cli/dist/index.js --host 127.0.0.1:6767 daemon status
```

Check three things. `daemonVersion: 0.11.1`, `connectedDaemon: reachable`, and
`daemonNode:` pointing at system Node rather than Electron. Then add `dgx:6767`
over Tailscale as a direct connection in the Mac app.

## 6. Traps

- Never `build:desktop` on the DGX. It is Expo and electron-builder, 2.1 GB
  peaks, many minutes, and no daemon benefit.
- Run `npm install` on the DGX. Do not copy the Mac's `node_modules`. The three
  natives are arch-specific and will fail with an arch or ABI error.
- Watch for `node-gyp rebuild` in the install log. If it appears, stop.
- Two daemons cannot share one `PASEO_HOME`. The pid lock refuses.
- `0.0.0.0` with no password exposes the daemon to the whole network. Over
  Tailscale, set a password.
- Without `loginctl enable-linger`, the unit stops at logout.
- Speech models download at boot unless you disable them as in section 5.5.

## 7. Proved and inferred

Proved on this Mac, 2026-10-19, throwaway `PASEO_HOME`:

- `supervisor-entrypoint.js` runs under plain system Node and serves on
  127.0.0.1:6799.
- CLI `daemon status` reports `0.11.1`, reachable, and `daemonNode` at Homebrew
  Node.
- All seven workspaces pack to seven tarballs, 3.1 MB, no binaries inside.
- The packed server carries the overlays: `MINE`, `sub-label`, `reload-wait`,
  `pi-worktree-trust` and `claude-auto-compact-window` all appear in packed JS.
- Every `dist` tree is pure JS.
- The `node-pty` linux-arm64 prebuild exists in the installed package.
- `sherpa-onnx-linux-arm64` and `@esbuild/linux-arm64` are declared optional
  deps.
- Build wall and RSS per package, in section 4.
- With `features.dictation.enabled: false` and `features.voiceMode.enabled: false`
  the daemon reports all four speech providers `unavailable`, starts zero model
  downloads, and still listens. So the config in section 5.5 is safe on a
  headless box.

Inferred, to prove on the DGX:

- The same flow on aarch64 Ubuntu 24.04. The JS is arch-neutral and the natives
  are prebuilts, but I did not run that step.
- `npm install -g` picks the arm64 prebuilts without compiling. Verify from the
  install log.
- Peak RSS of `npm install` on the DGX. The tarballs are 3.1 MB, but dependency
  resolution still pulls the full tree.
- The DGX's Node version. KLV says 26.8.1, so the Node step is probably a no-op.

## 8. Effort

Mac build, pack and copy: about 15 minutes, of which the build is 30 seconds.
DGX install, config, unit and proof: 30 to 45 minutes, mostly npm. Total about an
hour. The only real risk is an unexpected `node-gyp` compile at install.
