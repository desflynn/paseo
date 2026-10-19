# Paseo fork daemon on pcg5 (Windows 11, win32-x64)

Answer to KLV Head Guy, board o11. Fork `desflynn/paseo`, branch `0.11.1-df`.

Read-only research. Nothing was built or changed on pcg5. Proven lines are from
the code in this checkout and from the same steps run on the Mac. Inferred lines
are marked as such.

Your DGX result is a good omen: the Windows path is the same shape, and the two
traps you found (PATH in the unit, `Provider 'pi' is not available`) both apply
here too. See section 6.

---

## The short version

Same route: build and pack on the Mac, `npm install -g` the seven tarballs on
pcg5 with the existing Volta Node, run `supervisor-entrypoint.js` under an
interactive logon scheduled task, and switch the stock desktop app off daemon
management so it connects to your daemon as a Direct connection.

The desktop **window** stays stock. That is fine: all ten overlays are
daemon-side, which is what you already verified on the DGX.

---

## 1. Do the win32-x64 natives work, and what does npm -g put on PATH

**Yes, and nothing compiles.** The installed `node-pty` package ships every
platform prebuild in the tarball, so the Windows one is already there:

```
packages/server/node_modules/node-pty/prebuilds/
  darwin-arm64  darwin-x64  linux-arm64  linux-x64  win32-arm64  win32-x64
node-pty/prebuilds/win32-x64/
  conpty.node  conpty_console_list.node
```

`node-pty`'s install script is `node scripts/prebuild.js || node-gyp rebuild`,
and `prebuild.js` exits 0 when `prebuilds/<platform>-<arch>` exists. So on
win32-x64 it exits 0 and **node-gyp never runs**. This is the same mechanism
that made the DGX install compile nothing.

The other two are declared as optional platform deps:

- `esbuild` → `@esbuild/win32-x64`
- `sherpa-onnx-node` → `sherpa-onnx-win-x64` (plus `win32-ia32`)

Speech is lazy, as on Linux: `loadSherpaOnnxNode()` is called from the VAD, TTS
and recogniser classes, not from `bootstrap.ts`. A missing sherpa breaks voice,
not boot. With speech disabled in config it is never loaded at all.

ConPTY rather than winpty is what this version uses: `node-pty` 1.2.0-beta.15
ships `conpty.node`, and the daemon's terminal code is written against it
(`packages/server/src/terminal/terminal.ts`), including an `uncaughtException`
guard for conpty's asynchronous spawn failures
(`terminal-worker-process.ts:26-37`).

**PATH under Volta.** Volta owns the shims: `npm install -g` under Volta does
not write to a `npm prefix` you set yourself, it installs into the Volta-managed
toolchain and puts the `paseo.cmd` shim in `%LOCALAPPDATA%\Volta\bin`, which is
already on the user's PATH. So:

```cmd
npm install -g C:\Users\Des\Downloads\dgx-packs\*.tgz
where paseo
npm root -g
```

`where paseo` should print something under `%LOCALAPPDATA%\Volta\bin`. **Inferred,
not proved here** (I have no Windows box): verify those two commands before
relying on it. If `npm config get prefix` returns a path of your own, Volta is
not intercepting and the shim lands there instead.

The tarballs are the same seven and the same 3.1 MB: `protocol`, `client`,
`highlight`, `relay`, `plugin`, `server`, `cli`. They contain no binaries, so
the Mac build is reusable unchanged.

---

## 2. Running it so it survives logout

Your plan is right, and the code does not fight it. `supervisor-entrypoint.js`
is an ordinary Node program: it takes the pid lock, forks the daemon worker, and
logs. There is nothing service-specific about it.

Use an **interactive logon scheduled task**, not a service. A service runs in
session 0 with the SYSTEM profile, so the agents the daemon launches (claude, pi,
dci-mcp) would not see Des's profile, PATH, or installed CLIs. Your instinct
matches the requirement.

```cmd
schtasks /Create /TN "Paseo daemon (0.11.1-df)" ^
  /SC ONLOGON /RU Des /RL HIGHEST /IT ^
  /TR "\"%LOCALAPPDATA%\Volta\bin\node.exe\" \"%LOCALAPPDATA%\Volta\tools\image\node\24.12.0\node_modules\@getpaseo\server\dist\scripts\supervisor-entrypoint.js\""
```

Notes, in order of how likely they are to bite:

- `/IT` makes it interactive, which is what puts it in the console session.
  Without it, `claude` and `pi` can start but any UI-touching path fails.
- Resolve the real `node.exe` (Volta shims are `.cmd` wrappers). Use
  `where node` and paste the `.exe` path, not the shim.
- Same for the entrypoint: use the absolute path from `npm root -g`, not a
  shim. `npm root -g` gives you the `node_modules` root; the entry is
  `<root>\@getpaseo\server\dist\scripts\supervisor-entrypoint.js`.
- Set the environment in the task or in the user's environment: `PASEO_HOME`,
  `PASEO_LISTEN`, `PASEO_LOG_FORMAT=json`. The task inherits the logon
  environment, which is why it sees the user's PATH, and that is the whole point
  of `/IT`.
- **Your DGX trap applies here.** If `~/.local/bin` had to be on PATH there,
  then on Windows the equivalent is ensuring the directory holding `claude.cmd`
  and `pi.cmd` is on the PATH the task sees. That is what produces
  `Provider 'pi' is not available`.
- Start the task by hand once (`schtasks /Run /TN ...`) and check the daemon log,
  rather than waiting for a logon to prove it.

For restart-on-crash, add `/RI`/`/DU` or a second trigger; simplest is a minute
repeat with the pid lock as the guard, since the lock refuses a second
supervisor.

---

## 3. Coexisting with the stock desktop app

Two settings, one file:

```
%APPDATA%\Paseo\desktop-settings.json
```

```json
{
  "daemon": {
    "manageBuiltInDaemon": false,
    "keepRunningAfterQuit": false
  }
}
```

**What this does, from the code:** `startDaemon()` calls
`assertBuiltInDaemonManagementEnabled`, which throws
`"Built-in daemon management is disabled."` when the flag is false
(`packages/desktop/src/daemon/daemon-manager.ts:273-280`). So the app will not
start its own daemon. Proved from source. The settings schema is permissive
(`z.looseObject`), so extra keys are ignored and unknown keys will not break it.

Then point the app at your daemon as a **Direct connection to 127.0.0.1:6767**,
exactly as you would from the Mac app. No password on loopback is fine; the
daemon writes a `local-credential` token at startup and a same-machine client
uses it, which is why local connections need nothing typed.

**What stops a double daemon:** the pid lock. `supervisor-entrypoint.js` calls
`acquirePidLock` against `PASEO_HOME` and refuses to start a second supervisor on
the same home. So the two cannot both hold `C:\Users\Des\.paseo`. Order matters:

1. Quit the Paseo desktop app (this stops its managed daemon).
2. Confirm nothing is listening: `netstat -ano | findstr :6767`.
3. Set `manageBuiltInDaemon: false`.
4. Start the scheduled task, confirm it listens.
5. Launch the app and add the Direct connection.

If you skip step 1 the node daemon will fail the pid lock, which is a refusal and
not corruption, but it wastes a confusing ten minutes.

Two cautions:

- The stock app's daemon and yours share `C:\Users\Des\.paseo`, so they share
  config, agents, workspaces and the plugin registry. That is what you want for
  continuity, but it also means a stock daemon and a fork daemon can never run
  at the same time.
- After an app update, re-check `desktop-settings.json`; an update that rewrites
  defaults could turn management back on.

---

## 4. Windows-specific code in the daemon and overlays

Path separators are not a problem: the daemon uses `node:path` throughout and the
stock app already ships on Windows, so that path is exercised.

**Terminals are explicitly handled.** `terminal.ts` documents the exact bug you
would hit otherwise: conpty's `CreateProcess` does not apply `PATHEXT`, so a bare
`claude` fails with `error code: 2`, and worse, the failure surfaces on conpty's
conout worker thread as an uncaught exception. The file resolves `.cmd`/`.bat`
targets to a single pre-escaped `cmd.exe` command line with caret-escaping
(`terminal.ts:242-305`). So interactive terminals in the app are correct.

**Agent launching is the part to watch, and your DCH finding is real.** The
daemon resolves a provider executable through `which` with `PATHEXT`
(`executable-resolution/executable-resolution.ts:51`), and on Windows that
returns `claude.cmd` / `pi.cmd`, the npm shims. Paseo's own spawn helper passes
`shell: options?.shell` straight to Node (`packages/server/src/utils/spawn.ts:71`)
and does **not** set shell for these launches. A `.cmd` executed that way runs
through `cmd.exe`, so the process the daemon holds is the shim, and the real
`node` is its child. That is exactly the mismatch DCH described: the registered
pid is not the reader.

The Claude provider goes through `@anthropic-ai/claude-agent-sdk`, which does its
own Windows handling, so it may behave differently from Pi, which Paseo spawns
directly through `spawnProcess` (`providers/jsonl-rpc-process.ts:65-66`).

**The clean workaround**, if you see pid or exit-detection oddities: give the
provider an explicit command instead of letting `which` find the shim. The
config type is `{ command, args }` with a `mode` (`provider-launch-config.ts:35-40`,
and `commandConfig.mode === "replace"`). Point it at `node` plus the CLI's entry
`.js`:

```json
{
  "providers": {
    "pi": {
      "command": {
        "mode": "replace",
        "command": "node",
        "args": [
          "C:\\Users\\Des\\AppData\\Roaming\\npm\\node_modules\\@mariozechner\\pi\\dist\\cli.js"
        ]
      }
    }
  }
}
```

Treat that path as an example to verify with `where pi` and by opening the
`.cmd` to see what it points at, not as a literal. The principle is what matters:
`node` plus a `.js` makes the tracked pid the real process. **Inferred**: I did
not run this, and the exact `cli.js` path depends on how Pi is installed on pcg5.

---

## 5. What is proved and what is inferred

**Proved from the code in this checkout:**

- `node-pty` 1.2.0-beta.15 ships `prebuilds/win32-x64/conpty.node` and
  `conpty_console_list.node`, and its install script exits 0 when that directory
  exists, so node-gyp does not run.
- `sherpa-onnx-node` declares `sherpa-onnx-win-x64`; `esbuild` declares
  `@esbuild/win32-x64`.
- Speech loading is lazy, not part of bootstrap.
- Terminals handle `.cmd`/`.bat` with a caret-escaped `cmd.exe` line, and guard
  conpty's async spawn failure.
- Provider executables resolve through `which` + `PATHEXT`, so npm shims are what
  a default install finds.
- Paseo's spawn helper passes `shell` through and does not set it.
- `manageBuiltInDaemon: false` makes daemon management throw, so the app will not
  start its own.
- Settings live in `<userData>/desktop-settings.json`, schema `z.looseObject`.
- The pid lock refuses a second supervisor on one `PASEO_HOME`.
- The seven tarballs pack to 3.1 MB with no binaries inside (done on the Mac).

**Inferred, to prove on pcg5:**

- That Volta puts the `paseo` shim in `%LOCALAPPDATA%\Volta\bin` and that the
  task's PATH picks up `claude`/`pi`. This is the most likely snag, given what
  you saw on the DGX.
- That `npm install -g` on win32-x64 resolves the prebuilts without compiling.
  Check the log for `node-gyp rebuild`.
- The exact Pi `cli.js` path for the explicit-command workaround.
- That an `/IT` logon task in the console session is enough for agents to see the
  full user profile. Very likely, since it is your DCH WinFsp pattern, but I did
  not run it.

---

## 6. Effort and order

About an hour, same shape as the DGX: 15 minutes on the Mac (build and pack are
already done if you kept `/tmp/dgx-packs-2`), 30-45 on pcg5, mostly waiting on
npm and one reboot to prove the logon task.

Suggested order: pack on the Mac, install on pcg5, prove the daemon by hand in a
console (`node <entrypoint>` in the foreground, `paseo daemon status`), then wire
the scheduled task, then turn off `manageBuiltInDaemon` and add the Direct
connection. Do not do the app switch first; you want a working daemon before the
app loses its own.

The single most likely failure is the PATH one you already met. Check
`where claude`, `where pi` and `where paseo` **from the same context the task
uses** before blaming the daemon.
