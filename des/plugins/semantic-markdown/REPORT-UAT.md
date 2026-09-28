# Report UAT

## Purpose

This file records how Des wants agent reports to read and look. UAT uses realistic
owner-facing messages in increasing levels of complexity. Parser fixtures and internal
diagnostics are not report examples.

## Report rules

- Write a report as conversation, not as a test fixture.
- Use semantic treatment only where it helps Des read the message.
- Do not tag internal plumbing such as handoffs, context management, subagents, or test
  orchestration unless it blocks the work.
- Match the ask to the real decision. Do not flatten a complex decision into a toy choice.
  Do not bundle unrelated checks to make an ask look substantial.
- Give each numbered question or ask a unique, sequential number within the report.
- Keep addenda and connecting prose plain.
- In a question-led report, number and highlight the question itself. The number identifies
  the question, while A/B/C identify its possible outcomes.
- Write each outcome as a complete answer. Use its plain addendum for consequences or context,
  not for meaning needed to understand the outcome.
- Reserve cards for finished reports that need owner attention. Interim messages stay in
  ordinary chat layouts.
- Preserve Paseo's typography, spacing, wrapping, and whole-reply selection.

## UAT sequence

Run each stage with credible report content. Des passes each stage before the next begins.

| Stage                        | Status            | What it proves                                                                             |
| ---------------------------- | ----------------- | ------------------------------------------------------------------------------------------ |
| Single line                  | Passed 2026-09-28 | A short semantic line reads naturally without becoming a card                              |
| Paragraph chat               | Passed 2026-09-28 | Natural conversation with asks inside one paragraph or across paragraphs                   |
| Bullets                      | Passed 2026-09-28 | Semantic spans compose with ordinary and nested lists                                      |
| Mixed paragraphs and bullets | Passed 2026-09-28 | Prose carries the story, bullets organise evidence, and the ask returns to prose           |
| Moderate report              | Passed 2026-09-28 | Mixed prose, headings, bullets, nested evidence, and one decision, without a table or card |
| Complex report               | Passed 2026-09-28 | Three or four numbered questions and complete outcomes render inside table cells           |
| Finished cards               | Passed 2026-09-28 | Separate done, ask, and deferred cards form one finished report stack                      |

All report smoke stages passed on 2026-09-28.

## Single line

The single-line smoke passed with one highlighted ask and muted alternatives on a plain
line. It stays in ordinary chat and does not become a card.

```text
{ask}==**Ask 1.**\ **A. Commit and push**=={/ask} after the final diff review OR {muted}B. Commit locally only{/muted} so you can inspect it before pushing OR {muted}C. Leave it uncommitted{/muted} until the card smoke is complete. I will hold the changes until you choose.
```

## Accepted paragraph pattern

Paragraph UAT passed with natural conversational content and asks inside the prose. The
highlight, get-out, muted-option, wrapping, and selection mechanics below are part of that
accepted pattern.

```text
{ask}==**Ask 1.**\ **A. Commit and push**=={/ask} addendum OR {muted}B. Commit locally only{/muted} addendum OR {muted}C. Whatever{/muted} addendum. I will do something after.
```

- `Ask 1.` and option A are bold ask highlights.
- `\ ` consumes the backslash, renders one plain space, and resumes the same highlight.
  This gives two visible highlight blocks from one wrapper.
- Bold is explicit Markdown. A highlight does not imply bold.
- B and C use muted inline text with no background.
- Addenda, `OR`, punctuation, and the closing sentence stay plain.
- The backslash never appears in the rendered report.
- Both `=={ask}content==` and `{ask}==content=={/ask}` highlight forms work. The wrapped
  form supports the accepted single-wrapper paragraph pattern.

Accepted paragraph smoke source:

```text
Visible load and parse errors are still enabled while the renderer is under test. {ask}==**Ask 1.**\ **A. Keep the error cards visible through UAT**=={/ask} so failures cannot disappear, OR {muted}B. Fall back to ordinary Markdown{/muted} and record failures only in the plugin log, OR {muted}C. Keep the cards on desktop only{/muted} until mobile UAT is complete. I will leave the current behaviour unchanged until you choose.
```

## Bullets

The bullet-only smoke passed with semantic spans inside ordinary and nested lists.

```text
- {deferred}P8 is parked{/deferred}. The range, grey background, and my likely cause are recorded in `proposal-reviews/T8-emitters-paperwork-UAT.md`.
- {done}The demo is complete{/done}. Steps 1 to 7e passed, and rendering is proven.
- Eight items, P1 to P8, are parked in the UAT document.
- {ask}==**Question 1.**\ **Should one room be able to use steel or AL inside a zone of the other type?**=={/ask}
  - **Today:** The type belongs to the zone. An exception needs a one-room zone, with the room moved into it using ⇄.
  - **Recommendation:** Keep the type at zone level. A one-room zone gives the same result without adding another setting.
  - {ask}==**A. Keep steel or AL at zone level and use one-room zones for exceptions**=={/ask} without adding another material setting.
  - {muted}B. Add a per-room steel or AL override{/muted} so rooms can differ without separate zones.
  - **Next:** I will move to Question 2 after your answer.
```

## Mixed paragraph and bullet pattern

Use prose for the report story, bullets for the evidence, and prose again for the answer.
The highlighted question bullet is the reading and grep anchor. Do not add a separate `Ask 1`
label when `Question 1` already identifies the decision.

```text
Context paragraph.

- {ask}==**Question 1.**\ **The full question?**=={/ask}
- **Today:** Current behaviour.
- **Recommendation:** Recommended direction and why.

{ask}==**A. A complete answer**=={/ask} plain consequence OR {muted}B. Another complete answer{/muted} plain consequence.
```

- Keep the whole question in the highlighted question bullet.
- Make A/B/C understandable without their addenda.
- Keep addenda, `OR`, and final follow-up prose unstyled.

Accepted mixed smoke source:

```text
{deferred}P8 is parked{/deferred}. The range, grey background, and my likely cause are recorded in `proposal-reviews/T8-emitters-paperwork-UAT.md`.

{done}The demo is complete{/done}. Steps 1 to 7e passed, and rendering is proven. Eight items, P1 to P8, are parked in the UAT document. We will take them one at a time, starting with P1.

- {ask}==**Question 1.**\ **Should one room be able to use steel or AL inside a zone of the other type?**=={/ask}
- **Today:** The type belongs to the zone. An exception needs a one-room zone, with the room moved into it using ⇄.
- **Recommendation:** Keep the type at zone level. A one-room zone gives the same result without adding another setting.

{ask}==**A. Keep steel or AL at zone level and use one-room zones for exceptions**=={/ask} without adding another material setting OR {muted}B. Add a per-room steel or AL override{/muted} so rooms can differ without separate zones. I will move to Question 2 after your answer.
```

## Moderate report pattern

A moderate report combines prose, headings, ordinary or nested bullets, and one numbered
decision. It stays in ordinary chat. It does not use a table or a card.

Accepted moderate smoke source:

```text
## Smoke: Moderate report

Testing a progress summary with grouped evidence, one numbered decision, complete A/B outcomes, and a plain closing action. This is still ordinary chat, not a card.

{done}The semantic report renderer now works in single-line, paragraph, mixed, and bullet-only layouts{/done}. The changes remain uncommitted while UAT continues.

**Implemented**

- Inline colour tags and highlights work in both supported syntaxes.
- `\ ` creates a plain gap inside one highlight wrapper.
- Whole-reply selection crosses paragraphs, headings, and lists.
- Typography follows Paseo’s stored font settings.

**Verified**

- All 74 plugin tests pass.
- Lint and typecheck are clean.
- The rebuilt plugin reloads without errors.
- Native inspection confirmed the bold ask highlights, plain gap, muted alternatives, and ordinary addenda.

- {ask}==**Question 1.**\ **What should happen when semantic rendering fails during the rest of UAT?**=={/ask}
  - **Today:** Visible load and parse error cards preserve the original message.
  - **Recommendation:** Keep them until UAT is complete so a failed transformation cannot disappear.

{ask}==**A. Keep visible error cards enabled until UAT is complete**=={/ask} so failures remain obvious OR {muted}B. Fall back to ordinary Markdown now and record failures only in the plugin log{/muted} to reduce visual noise. I will leave the current behaviour unchanged until you choose.
```

## Complex report pattern

A complex report may put the decision inside a table. The UAT must place the highlighted
numbered question, highlighted A outcome, muted alternatives, and plain addenda in table
cells. A table beside an ordinary ask does not test this pattern. The complex table smoke
must show three or four distinct, realistic questions in one report so the grouping and scan
order are visible. It may use a fresh scenario rather than forcing an earlier smoke example
to carry more decisions than it naturally has.

Accepted complex smoke source:

```text
## Smoke: Complex multi-question table

Testing three distinct asks in one table. Each row must contain its own numbered question, current state, complete A/B outcomes, and plain addenda.

{done}Desktop report rendering is ready for release review{/done}. Three decisions remain before the plugin can leave UAT.

| Question | Current state | Outcomes |
| --- | --- | --- |
| {ask}==**Question 1.**\ **How should rendering failures behave after UAT?**=={/ask} | Visible error cards preserve the original message and diagnostic detail. | {ask}==**A. Fall back to ordinary Markdown and record the failure in the plugin log**=={/ask} so the report remains readable OR {muted}B. Keep visible error cards in released builds{/muted} so failures remain obvious to the user. |
| {ask}==**Question 2.**\ **Should the build stamp remain under every transformed report?**=={/ask} | Each semantic report currently shows its plugin build timestamp. | {ask}==**A. Remove the visible stamp and keep the build ID in logs**=={/ask} to reduce chat noise OR {muted}B. Keep the visible stamp through beta{/muted} so screenshots identify the exact build. |
| {ask}==**Question 3.**\ **Should the semantic renderer ship before mobile UAT is complete?**=={/ask} | Desktop rendering and selection are proven; mobile rendering has not completed UAT. | {ask}==**A. Complete mobile UAT before shipping the renderer**=={/ask} so both platforms leave UAT together OR {muted}B. Ship the desktop renderer first{/muted} and finish mobile verification afterward. |

I will apply the three decisions together and record the accepted release behaviour in the UAT document.
```

## Finished cards pattern

A finished report may stack three separate cards:

1. A done card for the completed work.
2. An ask card for a minor active decision.
3. A deferred card for a parked decision.

Keep one semantic state per card. Do not put an ask or deferred section inside the done card,
and do not put loose ask paragraphs between cards. Ask and deferred card bodies use the normal
question and outcome pattern: highlighted numbered question, highlighted A outcome, muted
alternatives, and plain addenda and `OR` separators. The card type describes the card's status;
the inner ask treatment keeps questions and outcomes consistent with ordinary reports.

Accepted finished cards smoke source:

```text
## Smoke: Finished three-card stack

Testing one finished report composed of separate done, ask, and deferred cards. Each question uses the normal ask treatment inside its own card.

> [!done] Semantic report renderer complete
> Inline report rendering, selection, typography, and semantic tags are implemented.
>
> - All 74 plugin tests pass.
> - Lint and typecheck are clean.
> - Single-line, paragraph, bullet, mixed, moderate, and complex table UAT have passed.
>
> The renderer work is complete.

> [!ask] Minor release decision
> {ask}==**Question 1.**\ **Should the visible build stamp remain through beta?**=={/ask}
>
> {ask}==**A. Remove the stamp before release**=={/ask} to keep normal chat clean OR {muted}B. Keep the stamp through beta{/muted} so screenshots identify the exact build.
>
> I will apply this answer before release.

> [!deferred] Parked mobile decision
> {ask}==**Question 2.**\ **Should card spacing be allowed to differ on mobile?**=={/ask}
>
> {ask}==**A. Keep shared spacing until mobile UAT proves a problem**=={/ask} to avoid speculative platform differences OR {muted}B. Add mobile-specific card spacing{/muted} if native layout needs it.
>
> This decision is parked until mobile UAT.
```

## Named card composition

A finished report may put a card inside a table cell through a named definition. The
definition is a hidden prerequisite and appears before the table that references it. It does
not render at its declaration point; the reference is the only display position. This
composition passed with the definition-first smoke:

```text
## Smoke: Definition-first outer table → ask card → inner semantic table

Testing a hidden card prerequisite declared before the table. It must not render at its declaration point; the later table reference is its only display position.

{card:release-decisions}
> [!ask] Release decisions
> The outer table cell owns this card. Two decisions remain.
>
> | Question | Outcomes |
> | --- | --- |
> | {ask}==**Question 1.**\ **How should rendering failures behave after UAT?**=={/ask} | {ask}==**A. Fall back to ordinary Markdown and record the failure in the plugin log**=={/ask} so the report remains readable OR {muted}B. Keep visible error cards in released builds{/muted} so failures remain obvious. |
> | {ask}==**Question 2.**\ **Should the build stamp remain under transformed reports?**=={/ask} | {ask}==**A. Remove the visible stamp and keep the build ID in logs**=={/ask} to reduce chat noise OR {muted}B. Keep the visible stamp through beta{/muted} so screenshots identify the exact build. |
>
> I will apply both answers together before release.
{/card}

| Container | Nested report |
| --- | --- |
| Release review | {card:release-decisions} |
```

## Adaptive table widths

Table columns size to their content. The final untagged smoke proved that ordinary Markdown
tables are claimed by the plugin and that a short identifier column can shrink below the
ordinary four-column floor:

```text
| ID | State | Question | Outcome |
| --- | --- | --- | --- |
| 1 | Open | Ship this renderer ownership change? | The plugin now owns ordinary tables and gives the explanatory outcome the available width. |
| 2 | Done | Did the compact-column rule apply? | The two-character identifier column can shrink below the ordinary four-column floor. |
```

## UAT method

- Start every smoke with a plain header naming the UAT stage under test. Follow it with one
  short line that says what Des should inspect.
- Test one layout stage at a time.
- Use content that could appear in a real agent reply.
- Check the result in the Paseo desktop app, not only in parser tests.
- Inspect captures with native vision. Use an image-description model only as a fallback.
- Record only behaviour that Des has accepted as passed.
