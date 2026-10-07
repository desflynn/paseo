# Captain's log — owner-facing markup block

Standing orders (from Des, 2026-09-28): run under /conn until the block is live in ~/CLAUDE.md and the HHC3 agent f0bd727e produces its Question 1 in semantic markup.

## State

- [x] Card-in-table form agreed with worker f3319424
- [x] Worker screenshot method learned
- [x] Fixed block re-smoked and verified by screenshot
- [x] Block inserted in /Users/des/CLAUDE.md after the doctrine, and yeeted
- [x] f0bd727e realigned; its Question 1 renders in the new markup

All standing orders met. Holding.

## Log

- Smoke 2 (child 0ffaa145): samples 1–6 pass. Sample 7 fails. The card definitions render in place and the tags show raw.
- Cause found: DESIGN.md example puts a blank line after `{card:name}` and `{/card}` behind `>`. The passing test (spike.test.ts:121) has no blank line and `{/card}` on its own line. The block copied DESIGN.md.
- Minor drift in smoke 2: the child wrote "Q2." and "Q1 settled:" in place of "Question 2." and "Q1: Settled:". The block needs a firmer label rule.
- The worker has added escapes (spike.test.ts:353 uses a backslash before the card tags).

- Worker confirmed: the parser is correct. `{/card}` must sit on its own line with no `>`. Written as `> {/card}`, it joins the card body and the definition never closes. A blank line after `{card:name}` is optional. The worker is fixing the DESIGN.md example.

- Worker answer: canonical definition is `{card:name}` directly above the `>` lines, then `{/card}` alone and unquoted. DESIGN.md fixed. Escapes: prefix any semantic piece with `\` (`\{danger}`, `\==`, `\{/card}`). 91 plugin tests pass. Nothing committed.
- Screenshot method: `osascript` for Paseo window bounds, then `screencapture -x -R<x>,<y>,<w>,<h> /tmp/<name>.png`, then read the PNG natively.

- Reloaded semantic-markdown (build 2026-09-28T12:12:52Z). Smoke 3 (child 31967f38): screenshot shows the table with defined cards renders correctly, and escapes render literally. Source faults: asks without the Question line (sample 1) and asks without A/B outcomes (samples 3, 6, 7). Block fixed: every open ask needs both parts. Escape rule now says it works inside a highlight.
- Screenshot tooling: `open paseo://h/srv_yu4vmxb9yxXW/agent/<id>` shows the chat. `/tmp/paseo-scroll <lines>` (Swift, built from /tmp/paseo-scroll.swift) scrolls; positive is up.

- Smoke 4 (child 59daf8ef): samples 2–8 pass in source and on screen. One card in two cells works. Card references outside a table render. Escapes work inside and outside a highlight. Sample 1 fails: the live-chat ask is plain prose, and the settled line has no label. Block fixed: the live-chat rule now says asks and settled answers keep their full form.

- Smoke 5 (child 12d5cb1e, live chat only): the ask form and the settled label now appear from the block alone. Screenshot renders clean. Fault: the new ask reused "Question 1" after Q1 was settled. Block fixed with an explicit no-reuse rule. Minor: the settled line used a normal space and not the `\ ` gap. It still renders, so no rule was added.
- Test artifact: my smoke prompt said "read no other file", which clashed with the owner's /ut command hook. The child followed my prompt and said so in chat. This is not a block fault.

- Block inserted in /Users/des/dev/central/houserules-review/canonical/CLAUDE.md (the ~/CLAUDE.md target), lines 163–212, before "# THE REST". Backup: CLAUDE.md.bak-20260928 beside it. Commit 5f1ba914 pushed to central origin/main. File is now 7,633 words; the block is about 8%.

## Decisions

- Fix the block's table example to put `{/card}` on its own unquoted line. No engine change needed.
- No smoke 6 after the numbering fix. Reason: the fault is a plain rule gap, and the weekly Claude plan is at 80% and burning ahead of pace. f0bd727e's real Question 1 is the final live check.

- f0bd727e reread CLAUDE.md and asked Question 1 (P1, zone-level radiator type) in the new form. Screenshot: correct render. It left no blank line between the question and the outcomes, so they sit tight together. Still correct.
- Archived smoke children 0ffaa145, 31967f38, 59daf8ef, 12d5cb1e.

## Deferred questions for Des

- Should the block require a blank line between the question line and the A/B outcomes? f0bd727e's render is correct but tight.
- The Paseo window now shows f0bd727e's chat. I switched chats with paseo:// links to take the screenshots.
- The DESIGN.md card fix and the escape feature from worker f3319424 are not committed. That is the worker's area.
- Untracked backup: /Users/des/dev/central/houserules-review/canonical/CLAUDE.md.bak-20260928.
