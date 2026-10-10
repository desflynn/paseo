#!/bin/sh
# Des authorized Fixer rollout; never resume agents or schedules here.
set -eu
sleep 20
archive=/Applications/Paseo.app/Contents/Resources/app.asar
prepared=/Users/des/dev/paseo/.dev/claude-auto-compact-window/backend-only.asar
record=/Users/des/dev/paseo/.dev/claude-auto-compact-window/rollout-result.txt
backup="${archive}.bak-claude-window-$(date +%Y%m%d-%H%M%S)"
test "$(shasum -a 256 "$archive" | awk '{print $1}')" = 9253ff529962205c3ee138616da7bc75800a9797b28e644f69087149cb9c9a6f
test "$(shasum -a 256 "$prepared" | awk '{print $1}')" = b747e6ca1c6afa918533625b3a5c6d54db7dc81f0a1d31583f73396f96004329
test ! -e "$backup"
printf 'state=stopping\nbackup=%s\nsource_commit=0166bcdd5\nreactivation_authorized=false\n' "$backup" > "$record"
osascript -e 'tell application "Paseo" to quit'
paseo daemon stop --home /Users/des/.paseo
cp -p "$archive" "$backup"
if ! cp "$prepared" "$archive"; then
  cp -p "$backup" "$archive"
  printf 'state=copy-failed-rolled-back\n' >> "$record"
  open -a /Applications/Paseo.app
  exit 1
fi
if ! test "$(shasum -a 256 "$archive" | awk '{print $1}')" = b747e6ca1c6afa918533625b3a5c6d54db7dc81f0a1d31583f73396f96004329; then
  cp -p "$backup" "$archive"
  printf 'state=hash-failed-rolled-back\n' >> "$record"
  open -a /Applications/Paseo.app
  exit 1
fi
printf 'state=archive-installed\n' >> "$record"
open -a /Applications/Paseo.app
printf 'state=paseo-reopen-requested\n' >> "$record"
# No continue prompts, wakeups, schedule resume, model boot or inference.
