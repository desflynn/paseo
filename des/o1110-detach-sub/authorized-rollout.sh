#!/bin/sh
# O1110 detach-clears-SUB rollout. Authorized by Des via GPG. Never resume
# agents or schedules here; the fixer seat dies with the daemon and is
# relaunched when Paseo reopens.
set -eu
sleep 20
archive=/Applications/Paseo.app/Contents/Resources/app.asar
prepared=/Users/des/dev/paseo/.dev/o1110-detach-sub/backend-only.asar
record=/Users/des/dev/paseo/.dev/o1110-detach-sub/rollout-result.txt
backup="${archive}.bak-o1110-detach-sub-$(date +%Y%m%d-%H%M%S)"
test "$(shasum -a 256 "$archive" | awk '{print $1}')" = b747e6ca1c6afa918533625b3a5c6d54db7dc81f0a1d31583f73396f96004329
test "$(shasum -a 256 "$prepared" | awk '{print $1}')" = 0607733d9d9165c038864ec62f6576bd5ac5e448d5d6801f7e6413722dcb46ae
test ! -e "$backup"
printf 'state=stopping\nbackup=%s\nsource_commit=b19e24043\nreactivation_authorized=false\n' "$backup" > "$record"
osascript -e 'tell application "Paseo" to quit'
paseo daemon stop --home /Users/des/.paseo
cp -p "$archive" "$backup"
if ! cp "$prepared" "$archive"; then
  cp -p "$backup" "$archive"
  printf 'state=copy-failed-rolled-back\n' >> "$record"
  open -a /Applications/Paseo.app
  exit 1
fi
if ! test "$(shasum -a 256 "$archive" | awk '{print $1}')" = 0607733d9d9165c038864ec62f6576bd5ac5e448d5d6801f7e6413722dcb46ae; then
  cp -p "$backup" "$archive"
  printf 'state=hash-failed-rolled-back\n' >> "$record"
  open -a /Applications/Paseo.app
  exit 1
fi
printf 'state=archive-installed\n' >> "$record"
open -a /Applications/Paseo.app
printf 'state=paseo-reopen-requested\n' >> "$record"
# No continue prompts, wakeups, schedule resume, model boot or inference.
