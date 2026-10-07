## Owner-facing markup — Paseo chat only

- Use semantic markup only in chat replies inside Paseo. In a terminal session, files, and commits, write plain Markdown.
- Kinds: `ask` (needs me), `done` (finished or settled), `deferred` (parked), `warning` (risk), `danger` (stop-level risk), `info` (useful fact), `muted` (not recommended).
- Inline colour: `{kind}text{/kind}`. Highlight: `{kind}==text=={/kind}` by default. `=={kind}text==` also works. Bold stays plain Markdown.
- Inside one highlight, `\ ` makes one plain gap, and the highlight continues after it.
- Tags do not nest. Pairs close on the same line. To show markup as literal text, put `\` before it: `\{danger}`, `\==`, `\{/card}`. This works inside a highlight too.
- Use markup only where it helps me scan. Keep narrative prose plain. Never tag plumbing such as handoffs, context, subagents, or tests, unless it blocks the work.

### Interaction types by phase

- **Design, `/ut`, or any live chat:** conversation. Talk in normal paragraphs. Never switch to status-update format. Use markup only for asks, settled answers, and a few inline tags. An ask in live chat still takes the full form below: the `Question N.` line and A/B outcomes. A settled answer still takes the `QN: Settled:` line.
- **Implementation and long runs:**
  1. **Small status:** one line or a paragraph. No stop.
  2. **Rich status:** significant progress. Inline markup, headings, bullets. No cards. No stop.
  3. **Mid-run stop:** a quick ask. Under `/conn`, emergencies only: a status paragraph, then the ask as a card.
  4. **Final stop:** ready for rollout. Cards, one state per card. Stack done, ask, and deferred cards as needed.

### Cards

A card means the work has stopped and waits for me. Put every line of a card, blank lines too, behind `>`. Without `>`, the body falls out of the card. Put all open questions in one ask card. The title names the topic, not "Question 1". Replace every placeholder with the real answer.

> [!ask] Two decisions before rollout
>
> {ask}==**Question 1.**\ **Keep the old settings file as a read-only fallback for one release?**=={/ask}
>
> {ask}==**A. Keep it read-only for one release**=={/ask} so a missed setting can still be recovered OR {muted}B. Delete it now{/muted} which is cleaner, but gives no safety net.

### Tables in complex reports

A complex final stop can use a table. A card cannot sit in a table cell directly. Define the card first, then reference it in the cell. Put `{card:name}` directly above the card. Put `{/card}` alone on the next line, with no `>`. The definition does not render where you write it.

{card:keys}

> [!warning] Provider Keys
> Write-only now. No plaintext read-back.
> {/card}

| Screen        | Result      |
| ------------- | ----------- |
| Theme         | Migrated    |
| Provider Keys | {card:keys} |

### Asks

- Every open ask, in every phase and every kind of output, has two parts: the `Question N.` line, then A/B outcomes on the next line. No ask without both.
- Write the labels exactly: `Question N.` for an open ask, and `QN: Settled:` for my answer. Never shorten an open ask to `QN.`
- Open ask: `{ask}==**Question N.**\ **The full question?**=={/ask}`
- Outcomes are complete answers: `{ask}==**A. The real recommended answer**=={/ask} plain consequence OR {muted}B. The real alternative{/muted} plain consequence.`
- When I answer: `{done}==**QN: Settled:**\ **the answer.**=={/done}`
- Count questions per phase: design, implementation, or a flight-plan phase. Start again at 1 only when a new phase starts. Within a phase, never reuse a number: after Q1 is settled, the next ask is Question 2. Add no phase marker.
