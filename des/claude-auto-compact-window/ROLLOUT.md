# Manual mac-studio daemon-only rollout

Run only after Des approves this rollout. Use a Mac Studio Terminal, not an agent shell: quitting/stopping Paseo interrupts running agents, including this one.

Only the compiled Claude provider module in app.asar changes. Renderer, app-dist, native binaries, configuration and unpacked dependencies stay unchanged. Version remains 0.11.1. Existing cached agent usage may need a new usage event before showing the new denominator.

## Install

```sh
set -eu
archive=/Applications/Paseo.app/Contents/Resources/app.asar
prepared=/Users/des/dev/paseo/.dev/claude-auto-compact-window/backend-only.asar
backup="${archive}.bak-claude-window-$(date +%Y%m%d-%H%M%S)"
test "$(shasum -a 256 "$archive" | awk '{print $1}')" = 9253ff529962205c3ee138616da7bc75800a9797b28e644f69087149cb9c9a6f
test "$(shasum -a 256 "$prepared" | awk '{print $1}')" = b747e6ca1c6afa918533625b3a5c6d54db7dc81f0a1d31583f73396f96004329
test ! -e "$backup"
osascript -e 'tell application "Paseo" to quit'
paseo daemon stop --home /Users/des/.paseo
cp -p "$archive" "$backup"
printf 'Rollback archive: %s\n' "$backup"
cp "$prepared" "$archive"
open -a /Applications/Paseo.app
```

Tell the Fixer the rollout is done and retain the printed backup path. It will verify the installed module hash, daemon status and actual Opus /550k and Haiku /112k context popup readings. Test results are not live popup proof. Do not send model inference solely to obtain a screenshot without approval.

## Rollback

Use the exact backup path printed during installation, replacing the placeholder below. This is also owner-run: it stops the daemon and restores the old archive.

```sh
set -eu
archive=/Applications/Paseo.app/Contents/Resources/app.asar
backup=REPLACE_WITH_PRINTED_BACKUP_PATH
test -f "$backup"
test "$(shasum -a 256 "$backup" | awk '{print $1}')" = 9253ff529962205c3ee138616da7bc75800a9797b28e644f69087149cb9c9a6f
osascript -e 'tell application "Paseo" to quit'
paseo daemon stop --home /Users/des/.paseo
cp -p "$backup" "$archive"
open -a /Applications/Paseo.app
```

If either install hash guard fails, stop: the prepared payload or installed archive changed. Prepare and verify a fresh payload rather than bypassing the guard.
