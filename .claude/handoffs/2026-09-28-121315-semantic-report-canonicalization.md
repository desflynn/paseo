# Semantic report plugin handoff

## Current objective

Finish the last UAT composition, then give agent `c8f61702-c8b0-4754-a755-ddf7d86ac379`
the verified canonical report guidance to use when writing the future global `CLAUDE.md` block.

## Accepted report UAT

All existing stages passed: single line, conversational paragraph, bullet-only, mixed
paragraph/bullets, moderate mixed report without a table, complex multi-question table, and
the finished three-card stack. The exact rules live in
`des/plugins/semantic-markdown/REPORT-UAT.md`.

The owner requires the final UAT file to contain the exact accepted smoke source, not generic
substitutes. Do not brief Opus until those canonical examples are present and verified.

## Plugin state

- Plugin path: `des/plugins/semantic-markdown`.
- Installed plugin ID: `semantic-markdown`; reload with `paseo plugin reload semantic-markdown`.
- Wrapped highlights `{kind}==content=={/kind}` and `=={kind}content==` both work.
- Inside a highlight, `\ ` renders one plain space outside the highlight and resumes it.
- Inline tags `{kind}content{/kind}` are colour-only.
- Cards use `> [!kind] Title`; card bodies parse full Markdown.
- Kinds: `ask`, `done`, `deferred`, `warning`, `danger`, `info`, `muted`.
- Whole-reply desktop selection and stored Paseo typography parity are implemented.
- Last full check before the current red-test step: 74 tests passed; lint/typecheck clean.

## Final composition under implementation

The owner selected named card references for table cells:

```md
| Container | Report         |
| --------- | -------------- |
| Release   | {card:release} |

{card:release}

> [!ask] Release decisions
> Full Markdown body, including tables and semantic tags.
> {/card}
```

Requirements:

- Definition reuses the existing card and full Markdown parser.
- Rendered card stays inside the referencing table cell.
- Definition does not render separately.
- Missing references and unclosed definitions remain literal.
- Nested tables use neutral `surface0`, not the containing card tint.
- Prove visually both card -> table -> semantic Markdown and table -> card -> table -> semantic Markdown.

Current baseline evidence:

- Card -> table -> semantic Markdown works, but table body inherits the card tint.
- Table -> card currently fails: `> [!ask]` remains literal while inline semantic spans render.
- Screenshots:
  - `/var/folders/xb/bhq6_qt95lsdq8r7d981dtmh0000gn/T/opencode/semantic-card-table-smoke-proof.png`
  - `/var/folders/xb/bhq6_qt95lsdq8r7d981dtmh0000gn/T/opencode/semantic-card-in-table-baseline.png`

## Current files and tests

Design was added to `des/plugins/semantic-markdown/DESIGN.md` under `Named card references`.

New failing regressions were just added but have not yet been run:

- `client/appearance.test.ts`: table background must equal `theme.colors.surface0`.
- `spike.test.ts`: named table-cell card reference resolves a hidden full-Markdown definition;
  missing/unclosed references remain literal.

Likely implementation path:

1. Add explicit `backgroundColor: theme.colors.surface0` to the table style.
2. Add source preparation in `shared/spike.ts` to extract closed `{card:name}` definitions,
   remove them from visible source, and expose a definition map.
3. Add inline `{card:name}` rule that emits `semantic_card_ref` with `{ id, source }` when the
   map has a definition; leave missing refs literal.
4. Ensure `parseSpike`, diagnostics, and the client renderer prepare the full source before
   block splitting, because definitions may contain blank lines.
5. Render `semantic_card_ref` with a nested `MarkdownRenderer` using the same semantic rules.
6. Add source-syntax detection for named refs.
7. Run focused tests, full plugin tests, formatting, lint, typecheck, rebuild, reload, then
   output the exact smoke at the transcript bottom and capture it with native `Read` vision.

## Communication constraints

- Use the semantic plugin when asking Des questions. The accepted shape is a highlighted
  numbered question, highlighted complete A outcome, muted complete alternatives, and plain
  addenda plus `OR`.
- Do not tag internal plumbing such as handoffs, context management, or subagents.
- Evolve corrections. Do not turn one criticism into a universal rule.
- Use native image vision through `Read`; do not use the DCI image-description model first.

## Opus handoff

Target agent: `c8f61702-c8b0-4754-a755-ddf7d86ac379`, confirmed idle
`claude-opus-5-5`. Do not send until implementation/UAT and canonical source are complete.
Tell him the plugin exists and is available to agents, but agents need a future global
`CLAUDE.md` guidance block to know when and how to emit the syntax. Tell him to absorb the
material and hold it for his next conversation with Des, without editing yet.

## Latest update after 12:13

- User selected option A, the named card reference.
- Implementation is now present in `shared/spike.ts` and `client/semantic-markdown.tsx`.
- Table style now owns `surface0`, fixing purple inner-table bodies.
- Full checks passed at this point: 78 tests, lint clean, typecheck clean.
- Live screenshot proved outer table -> referenced ask card -> neutral inner semantic table:
  `/var/folders/xb/bhq6_qt95lsdq8r7d981dtmh0000gn/T/opencode/semantic-table-card-table-proof.png`.
- User then corrected source order: hidden card definitions must appear before the table/reference.
  They are prerequisites, never visible output; only the later reference renders.
- `spike.test.ts` was changed to definition-first order and adds a complete-definition-hidden test.
- `prepareSemanticSource` now hides every complete definition immediately, without requiring a
  later reference. Unclosed definitions still fall back literally.
- `DESIGN.md` was corrected to show definition-first source.
- Run focused/full checks again, reload only if source changed (it did), then output the exact
  definition-first smoke at transcript bottom and capture with native vision.
- User also clarified streaming semantics: integrate with Paseo provisional streaming. Complete
  semantic markup renders when ready; complete named definitions remain hidden until referenced;
  if new markup begins before old markup closes, best-effort close the previous markup at that
  boundary, with literal fallback when safe rendering is impossible. Do not call all markup tags.
- Do not implement the broad malformed-markup recovery as an unreviewed side change. Record it
  and keep current work focused on definition-first named cards unless Des explicitly continues it.

## Latest update after definition-first proof

- Definition-first live smoke passed visually. Screenshot:
  `/var/folders/xb/bhq6_qt95lsdq8r7d981dtmh0000gn/T/opencode/semantic-definition-first-proof.png`.
- User then requested content-aware table columns. Accepted algorithm A:
  - equal content remains equal;
  - each column is clamped to 60%-180% of equal share, absolute max 70%;
  - gives 2 cols 30%-70%, 3 cols 20%-60%, 4 cols 15%-45%;
  - semantic source markers do not count; all rows share ratios.
- Red tests were added to `spike.test.ts` for equal 2-col, 30/70 2-col, and bounded 4-col.
- Implementation just added in `shared/spike.ts`:
  - `visibleTokenLength`
  - `boundedColumnFlexes`
  - `annotateTableColumnWidths`
  - core rule `semantic_table_widths` adds `data-semantic-flex` to th/td tokens.
- Renderer just changed in `client/semantic-markdown.tsx`:
  - `tableCellFlex(node)` reads the attribute;
  - th/td style arrays apply the calculated flex.
- THESE LATEST WIDTH CHANGES HAVE NOT BEEN TESTED OR FORMATTED YET. Run focused
  `node --test spike.test.ts`, fix any issues, then format, full 79+ tests, typecheck, lint,
  build/reload, and capture a table showing adaptive widths.
- After width UAT, `REPORT-UAT.md` still needs exact final accepted smoke source for every stage,
  including definition-first nested cards. Then brief Opus target agent and wait for confirmation.

## Latest state after final implementation

- Ordinary tables, fenced code blocks, Mermaid, blockquotes, and semantic markup are plugin-owned.
- Tiny columns with at most two visible characters can shrink below the normal table floor.
- Backslash escapes work for all semantic markers, closers, highlights, callouts, and card markers.
- `DESIGN.md` now uses the canonical card definition form with standalone, unquoted markers.
- `REPORT-UAT.md` contains all nine recovered accepted smoke sources.
- Opus agent `c8f61702-c8b0-4754-a755-ddf7d86ac379` absorbed the prose contract and is holding.
- Final checks passed: 91 plugin tests, typecheck clean, lint clean, plugin reloaded.
- Des asked to commit all semantic-markdown work without pushing.
- Commit has not started. Inspect status, diff, and log first. Stage only semantic-markdown files.
- Des asked to see the final table-card screenshots before commit. A fresh capture selected another
  active Paseo tab and is invalid. Show the existing verified captures instead:
  - `/var/folders/xb/bhq6_qt95lsdq8r7d981dtmh0000gn/T/opencode/semantic-definition-first-proof.png`
  - `/var/folders/xb/bhq6_qt95lsdq8r7d981dtmh0000gn/T/opencode/semantic-table-card-table-proof.png`
- Both verified captures were shown to Des.
- Des asked to disable the visible red try/catch cards. `PLUGIN_DEBUG` is now `false` in
  `des/plugins/semantic-markdown/index.client.tsx`.
- Final pre-commit checks just passed: targeted format, 91 plugin tests, plugin typecheck, and
  root targeted lint over `des/plugins/semantic-markdown`.
- Next: stage every changed/untracked file under `des/plugins/semantic-markdown` except
  `package.json.bak-20260928`. Do not stage `CLAUDE.md`, root `package-lock.json`, or `.claude/`.
- Inspect staged diff, then commit without pushing. Use a concrete subject and a body listing each
  logical fix.
