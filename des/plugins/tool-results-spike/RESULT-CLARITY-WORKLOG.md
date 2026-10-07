# Result Clarity Worklog — real result inspection

Scope: `shared/results.ts`, `shared/results.test.ts` only. No core, semantic-markdown, client, or preference files touched. No installs, commits or pushes.

## Unit 1 — RED: real-shape tests (failing first)

Added/updated tests for the shapes real tools emit:

- Get Agents MCP text: `agents_count=…\nagents_ids=…\n\n{"agents":[…]}` — payload after prose; rows carry nested `labels`, nullable `thinkingOptionId`, rich `parent`; original output must stay untouched.
- Malformed suffix: complete JSON body followed by `\nError: rate limited` — body still found, prose preserved.
- Ordinary prose with brace characters stays text.
- Nested wrapper: envelope-shaped record inside `structuredContent` unwraps (bounded depth).
- Multi-text hook: full-JSON part preferred over reminder prose parts.
- TodoWrite: `details:{source,action,version,tasks}` exposes the `tasks` array, not the envelope tower; ragged rows (missing optional `activeForm`) still table.
- Table rule relaxed: rich/nullable cells allowed; rows without any shared key stay a list; single row with a nested object is now a table (old all-scalars rule dropped intentionally).

## Unit 2 — GREEN: bounded parser + shape unwrap

- `jsonSpan`: bracket-depth walk honouring strings/escapes, capped at 256 KB per candidate; no regex.
- `findEmbeddedJson`: ≤16 brace/bracket candidate attempts per text part; accepts the first candidate whose **full balanced body** parses as object/array; leftover prefix/suffix kept as trimmed prose.
- Unwrap priority (depth ≤4): `structuredContent` (recursing into nested envelopes) → `details` with exactly one array field and scalar-only siblings (shape-driven, not name-coupled) → exact-JSON text part → embedded-JSON part → single-text-part prose → unchanged output.
- Prose+payload carrier `{prose, payload}` returned by `unwrapResult`; `inspectResult` maps it to the new `annotated` variant.
- Table: columns = union of row keys in first-seen order; requires ≥1 backbone column present in every row; rows stay the original records so nothing is dropped.

## Unit 3 — Correction

First run exposed a wrong expectation in my own new test: `{"agents":[…]}` is a single-field record, and record field values already render through `inspectResult`, so the table lives one level down. Fixed the assertion; envelope records with sibling metadata (`count`) remain records per the pinned test.

## Renderer contract for the parent (client views)

- `annotated` (new): render `prose` as a muted text block, then render `view` recursively. Compact: collapse prose to one line; wide: full block.
- `table`: columns may be absent from a row (optional fields) — render empty, not `"undefined"` (current `rawText(row[column])` prints "undefined"; needs a `?? ""` guard). Cells may be objects/arrays/null — scalar cells inline, non-scalars via `rawText` (already the case). Compact stays per-row cards; wide stays horizontal-scroll grid.
- `unwrapResult`'s carrier shape (`{prose, payload}`, exactly those two keys) is only produced when prose surrounded a JSON body.
