# DGX Spark → Paseo 0.13.0-df (linux arm64) upgrade runbook

2026-10-26/27 · built and written by Paseo Head Guy (Mac Studio) for MS Paseo Guy, o14.3.
Source: branch `0.13.0-df` @ `3ee4c96fb250c6357e2a96148759b3635ca2bceb` — includes the
26 Oct fixes (one-shot wake queueing `3ee4c96fb`, pi MCP probe cache + RPC timing
`859f6a939`, provider-catalog non-blocking start `f6dc41a61`).

## The one rule

**The DGX daemon is paired as `srv_x_M4dYQq9aCk` (label `dgx-spark`). Never reset or
recreate `~/.paseo` — back it up first and leave it in place.** The upgrade swaps the
binary only. Pairing, agents, workspaces, hostnames (`dgx-spark`,
`dgx-spark.tail662bb8.ts.net`), the bcrypt password and every other setting live in
`~/.paseo` and carry through untouched.

## Artifacts

Pack folder: `/Users/des/dev/personal/src/paseo/packages/desktop/release/linux-pack-20261026-arm64/`

| artifact                    | bytes       | sha256                                                             |
| --------------------------- | ----------- | ------------------------------------------------------------------ |
| `Paseo-arm64.AppImage`      | 172,082,511 | `38d4dc7e0582b9199f39bbe15efcd89e9077a9c438ad282e8dca360f4c31a4b5` |
| `Paseo-0.13.0-arm64.tar.gz` | 176,019,615 | `a37e00ec4226e2580dddadcf3e28153a9848149f5759969966a3c7924639fa58` |

Version proof: the embedded `resources/app.asar` → `package.json` reads **0.13.0** in
both (AppImage via squashfs carve at offset 197808 + unsquashfs; tar.gz via tar extract).
Same asar bytes in both (`e0e1a9a7…`). `resources/bin/paseo` CLI shim present in both.
The `resources/app-update.yml` inside is dormant — the box upgrades by this recipe,
never by electron-updater.

## Box facts (dgx-spark audit 20 Oct — re-verify live in phase 0)

- `dgx-spark`, 100.103.166.71 (tailnet), Ubuntu 24.04 aarch64, headless.
- Daemon today: 0.11.1 from the seven-tarball install, `daemonNode /usr/bin/node`.
- systemd `--user` unit with `Environment=PATH=%h/.local/bin:/usr/local/bin:/usr/bin:/bin`,
  `PASEO_HOME` set, `Restart=always`, `RestartSec=5`, enabled, `Linger=yes`.
- `~/.paseo/config.json`: `daemon.listen 127.0.0.1:6767` (tailnet forward carries remote),
  hostnames as above, bcrypt password, 9 agentProfiles.
- `~/.env` holds `PASEO_PASSWORD` for clients; it is never in the daemon environment.

## Steps

### 0. Pre-flight — record and back up, change nothing

```sh
ssh des@dgx-spark        # or ssh des@100.103.166.71
systemctl --user list-units 'paseo*'                    # exact unit name
systemctl --user cat paseo.service > /tmp/unit.before-$(date +%Y%m%d)   # ExecStart + env lines
readlink -f ~/.local/bin/paseo; ~/.local/bin/paseo --version            # current real path + version
tar -czf ~/paseo-home-bak-$(date +%Y%m%d-%H%M).tar.gz -C ~ .paseo       # the pairing backup
```

Note where the old install tree lives (the npm-tarball daemon) — that is the rollback
binary; keep it.

### 1. Transfer and verify

From the Mac Studio (over Tailscale):

```sh
scp packages/desktop/release/linux-pack-20261026-arm64/{Paseo-arm64.AppImage,Paseo-0.13.0-arm64.tar.gz} des@dgx-spark:/tmp/
ssh des@dgx-spark 'sha256sum /tmp/Paseo-arm64.AppImage /tmp/Paseo-0.13.0-arm64.tar.gz'
```

Both hashes must match the table above.

### 2. Extract to a stable versioned dir

The AppImage mount path (`/tmp/.mount_Paseo-*`) changes on every launch — never
reference it. Extract once, like the ideaPad 0.13 pattern:

```sh
chmod +x /tmp/Paseo-arm64.AppImage
/tmp/Paseo-arm64.AppImage --appimage-extract          # → /tmp/squashfs-root
mkdir -p ~/paseo
mv /tmp/squashfs-root ~/paseo/0.13.0-df
rm /tmp/Paseo-arm64.AppImage /tmp/Paseo-0.13.0-arm64.tar.gz   # or keep the tar.gz as a spare copy
```

`--appimage-extract` needs no display. The extracted `resources/bin/paseo` resolves its
own real path, then execs the bundled Electron binary with `ELECTRON_RUN_AS_NODE=1` —
no X server needed, shared libs still are (next step).

### 3. Electron shared libs (headless noble trap)

```sh
ldd ~/paseo/0.13.0-df/Paseo | grep 'not found' || echo libs-ok
sudo apt-get install -y libgtk-3-0t64 libnss3 libasound2t64 libgbm1   # only if missing
```

`bin/paseo` execs the Electron binary even for CLI/daemon use; without these the
dynamic linker fails before `ELECTRON_RUN_AS_NODE` matters.

### 4. Shim at the real path

```sh
ln -sfn ~/paseo/0.13.0-df/resources/bin/paseo ~/.local/bin/paseo
~/.local/bin/paseo --version        # must print 0.13.0
```

`~/.local/bin` is first on the unit's PATH — that is what makes this shim the CLI the
unit and plugins see. The symlink is fine here: the inner script resolves symlinks back
into the bundle. Never let anything shadow the system node from that dir (the dead x64
node trap from the bootstrap notes).

### 5. Repoint the systemd unit

```sh
cp ~/.config/systemd/user/paseo.service ~/.config/systemd/user/paseo.service.bak-$(date +%Y%m%d)
```

Edit the unit: swap the ExecStart binary for the real shim path, keep every argument the
old ExecStart carried (the daemon args and `--home %h/.paseo` stay as they are), and
keep the `Environment=` PATH line, `PASEO_HOME`, `Restart=always`, `RestartSec=5`:

```ini
[Service]
Environment=PATH=%h/.local/bin:/usr/local/bin:/usr/bin:/bin
Environment=PASEO_HOME=%h/.paseo
ExecStart=%h/.local/bin/paseo daemon start --home %h/.paseo
Restart=always
RestartSec=5
```

(Use the exact current args recorded in phase 0 — only the binary changes. If the box's
unit runs the daemon a different way, preserve that way; `manageBuiltInDaemon` stays
`false` — the bundled daemon is darwin-only and must never start on Linux.)

```sh
systemctl --user daemon-reload
systemctl --user restart paseo.service
systemctl --user status paseo.service      # active
```

### 6. Verify

```sh
~/.local/bin/paseo --version               # 0.13.0
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:6767/   # 401 (password gate) proves the daemon is up
```

Then from the Mac Studio Paseo app: the host list still shows **dgx-spark connected**
(`srv_x_M4dYQq9aCk` intact, no re-pairing), and the DGX agent list (Pi seat, Claude
seat) is unchanged. The web UI on `:6767` shows 0.13.0.

If the UI is ever launched on the box, first launch may need `--no-sandbox`; the
headless daemon/CLI path does not.

### 7. Register and rollback

Record in `~/BOX-REGISTER.md` on the box: what changed, the backup paths, the undo step
(same shape as the ideaPad register entries).

Rollback (binary swap only):

```sh
cp ~/.config/systemd/user/paseo.service.bak-YYYYMMDD ~/.config/systemd/user/paseo.service
ln -sfn <old-install-tree path recorded in phase 0> ~/.local/bin/paseo
systemctl --user daemon-reload && systemctl --user restart paseo.service
```

Verify it reports 0.11.1 and reconnects. `~/.paseo` is restored from the phase-0 tar
only if something actually corrupted it — a version swap never needs that.

## Mac Studio daemon restart (close-then-start law)

The 2026-10-27 install failed this section's first draft. The script killed only the
port-listener pid, then ran `open -a Paseo`. The old app was still running, so `open`
was a no-op and the old binary kept serving. Des fixed it by hand. The correct order:

1. Quit the app, not a pid: `osascript -e 'tell application "Paseo" to quit'`.
2. Wait until no Paseo process remains. Poll `pgrep -if 'Paseo.app'` until empty, then
   confirm port 6767 is free.
3. Only then start the new one: `open -a Paseo`.
4. Verify identity, not just liveness. The listener's process start time must be after
   the swap, and the installed asar must carry the expected marker.

Never kill a listener pid alone. The owning app respawns or holds the port. Close the
app, then start it.

## Build route (how the artifacts were made — Mac Studio, not on the box)

```sh
cd packages/desktop
npm --prefix ../.. run build:server:clean
npm run build:main
npx electron-builder --config electron-builder.nofeed2.yml --linux AppImage tar.gz --arm64
```

Three untracked helper files were left in `packages/desktop` (nothing committed, per the
brief): `electron-builder.nofeed.yml`, `electron-builder.nofeed2.yml` (publish removed /
`publish: []`), and `scripts/strip-update-feed.js` (afterPack chain). The `deb`/`rpm`
targets were not built — AppImage + tar.gz were the requirement; both succeeded on the
first full run and every retry.

Never build on the box itself: the ideaPad `build:desktop` pushed load to 49 and took
ssh down. Artifacts cross from the Mac Studio.
