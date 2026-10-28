# Android one-tap dictation flow — shared understanding

Date: 27 Oct 2026 · Owner: Des · Scribed by: MS Paseo App Guy
Status: understanding time (UT) — handover to MS Paseo Guy shortly
Source: spoken dictation from Des, items 1–5 plus one parked idea.

## Goal

Des dictates into his phone with an external dictation app that pastes text
into the Paseo message box. He does not type. The flow today costs him extra
taps between every message: refocus the box, summon the dictation overlay,
send. The goal is a one-tap loop: paste → auto-send → caret already back in
the box → paste again. Everything below serves that loop.

No knowledge of the external app is assumed. It pastes text into the box.
That is all the build needs.

## The items

### 1. Caret returns to the message box after send

After "Message sent" (send button pressed), focus and the blinking caret go
straight back into the message input — no re-tap before the next paste.

- Open: does the soft keyboard rising back up with the refocus bother Des?
  Default if unanswered: let it rise (simplest refocus).

### 2. Paste-send toggle replaces the stock dictate icon

Hide the stock dictate icon entirely. In its place, a new toggle icon:

- Tap: green = armed. Tap again: grey = off.
- Armed: if text is pasted into the message box, it sends itself about
  100 ms after the paste. No send-button press.
- Strictly pastes (settled): typed text does NOT auto-send — it waits for
  the send button. The trigger is a paste, not typing.
- The 100 ms figure is Des's "let's say" — near-instant is the intent, exact
  value is the implementer's to tune.

### 3. Volume-down mute with debounce (while speech plays)

Current behaviour (from earlier Paseo objectives, the stop-mid-play lane):
while speech output plays from the app, one volume-down press mutes it, and
volume-up turns it back on.

The problem: pressing down 2–3 times quickly — the natural "just make it
quieter" gesture — gets caught by the mute on the first press.

The wanted behaviour:

- A single volume-down press, alone: mutes playback.
- Rapid downs (2–3 presses within a few hundred ms): the mute never fires.
  The system volume steps down normally and playback continues at the lower
  volume.
- When the rapid presses settle (debounce window expires), a fresh single
  down press arms the muting logic again.
- Volume-up while muted: unmutes.

Mute semantics (settled): the stream keeps playing but silently — "it can
play but is muted". No pause logic. Unmuting means hearing it again from
wherever it has reached. The skipped part stays skipped.

### 4. Speak-underway indicator

While speech output plays, a small indicator appears in the composer
toolbar; it disappears the moment output ends.

Position (revised): to the LEFT of the context icon — chosen so the existing
icons never shift when it appears or vanishes. (First idea was between
context and dictate; rejected for exactly that reason.)

## Parked — not this build (P3, board objective at resume)

- A "replay last message" button.
- A mode/panel showing all sent messages, each playable.

## Handover and rollout (settled earlier)

- MS Paseo Guy implements; the app package is his lane. One build after.
- This seat builds once and rolls out the same as tonight: Mac Studio,
  ideaPad, Pixel — one installer per host, never two.
- Before each daemon restart (Mac Studio, ideaPad): capture the list of
  agents that were running, and after the restart ping each of them to
  continue, so the fleet comes back to life on the new build.

## Traps for the rollout (from tonight's runs)

- Verify a bundle by the hash in app-dist/index.html — never the newest .js.
- Smoke by ear on the phone plus logcat timings; unit green is not done.
- The packs carry app-update.yml (dogfood self-update risk — it once pulled
  0.13.2). Watch for it; a build-level strip is still undone.

## Open questions

1. Keyboard rising with the caret return — fine, or keep it down? (Item 1.)
2. Exact auto-send delay — 100 ms is the working number. (Item 2.)
