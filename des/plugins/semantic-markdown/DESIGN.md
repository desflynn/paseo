# Semantic Markdown plugin

## Goal

Render semantic agent markup without losing any Markdown behavior provided by Paseo 0.9.2.
The plugin owns parsing and rendering on desktop and mobile.

## Required parity

- Headings, emphasis, links, images, lists, blockquotes, tables, and horizontal rules.
- Inline code and syntax-highlighted fenced code.
- Mermaid diagrams and collapsible details blocks.
- Paseo's selection, copying, file-link, streaming, theme, and accessibility behavior.
- Stored typography: `uiFontFamily`, `monoFontFamily`, `uiBaseFontSize`, `contentFontSize`,
  and `codeFontSize` from the `@paseo:app-settings` blob drive the Markdown font ramp.

## Extensions

- Plain semantic colour: `{type} text` (line start, block treatment).
- Paired inline colour: `{type}content{/type}`.
- Semantic highlight: `=={type} text==`.
- Status strip: `{status}one line{/status}` — the pair must be the whole line; inline, unclosed,
  or multi-line stays literal. Renders the app's native info notification strip.
- Foldable titled callouts: `> [!type]+ Title` and `> [!type]- Title`.
- Inline and block math.
- Footnotes.
- Keyboard keys.
- Agent deep links: `[label](agent:<agentId>)` and `[label](paseo://h/<serverId>/agent/<agentId>)`
  open that agent's tab. Full UUID ids only — anything else falls through to the default link
  path. A full form naming another server shows a not-connected alert instead of navigating.

Kinds are `ask`, `done`, `deferred`, `warning`, `danger`, `info`, and `muted`.

## Exclusions

- Task lists.
- Workspace wikilinks.
- Spoilers for now.
- Arbitrary HTML, JSX, scripts, styles, event handlers, and iframes.

Agent output is always untrusted data. Plugin code may use React Native components; content is parsed and never executed.

## Approach

Vendor the Paseo 0.9.2 Markdown renderer into the plugin and remove app-only wiring. Preserve its behavior first, then add extensions as Markdown-it rules. Prebundle dependencies through the manifest build step so the client bundle remains compatible with Paseo's neutral plugin compiler and Hermes.

## Ownership

Claim a message that contains semantic markup, a valid Markdown table, a fenced code block,
or a blockquote. Mermaid is a fenced code block. Leave headings, lists, emphasis, links,
inline code, and plain prose with Paseo's renderer.

## Paired tag rules

- `{type}content{/type}` renders as an inline coloured-text span: colour only, no
  background and no box metrics, so it never changes line layout. Highlights keep
  their background tint and stay inline too.
- `{type}==content=={/type}` applies the same kind as an inline highlight. Use it for
  the Ask label and primary option while leaving surrounding addenda as plain prose.
- Inside a highlight, `\ ` renders that one space outside the highlight and resumes
  the same highlight after it. This keeps one source wrapper around adjacent Ask parts.
- Prefix a semantic marker with `\` to render it literally without the backslash. This
  applies to openers, closers, `==`, callout markers, and named card markers. For example,
  `\{ask}`, `\{/ask}`, `\==`, `\[!ask]`, and `\{card:name}` stay literal.
- Keep escaped markers inside a valid outer span. They do not close or break that span.
- Content is parsed as ordinary Markdown. Tags do not nest: if the content contains
  another semantic tag, the outer tag stays literal and the inner tag parses.
  Pairs must close on the same line.
- While a pair streams, hide its opener and unfinished content until the closing tag arrives.
- The line-start `{type} text` form stays the block treatment, unchanged.
- Option separators such as `or` are prose guidance. The parser has no separator
  behaviour and leaves them as plain text.

Kind colours (light / dark): `ask` #7c3aed / #c4b5fd, `done` #15803d / #86efac,
`deferred` #7c5c3b / #d6b98c, `warning` #b45309 / #fcd34d, `danger` #b91c1c / #fca5a5,
`info` #1d4ed8 / #93c5fd, `muted` #64748b / #94a3b8. `muted` marks poor or
unrecommended choices.

## Typography

- The plugin re-reads the same stored appearance values as the app and applies the
  same validation and clamping: sizes clamp to 10–21 (UI base, content) and 9–22
  (code); families are trimmed, capped at 200 chars, and reject `;{}<>` and control
  characters. Defaults are platform exact: UI base 15 native / 14 web, content 16
  native / 15 web, code 12.
- The ramp is derived exactly like `packages/app/src/appearance/apply.ts`: UI tiers
  scale by `uiBaseFontSize / FONT_SIZE.base`, `content` and `code` are absolute. The
  vendored `FONT_SIZE`/`SPACING`/`BORDER_RADIUS` values stay authored; only the theme
  tokens carry user values, so Markdown geometry is unchanged.

## Named card references

Standard Markdown table cells are inline-only. Define the hidden block card first, then
reference it where it must render:

```md
{card:release}

> [!ask] Release decisions
> Full Markdown body.
> {/card}

| Container | Report         |
| --------- | -------------- |
| Release   | {card:release} |
```

- The definition reuses the existing `> [!kind]` card grammar and full Markdown parser.
- Put `{card:name}` and `{/card}` on standalone, unquoted lines. Do not prefix either marker
  with `>`.
- A complete definition is hidden and registered immediately. It never renders at its source
  position, even before a reference arrives.
- The rendered card stays inside the referencing cell. Definitions do not render separately.
- Definitions may contain tables, semantic highlights, tags, lists, and paragraphs.
- Missing references and unclosed definitions stay literal.
- Tables own the neutral `surface0` background so nesting them in tinted cards does not tint
  the table body.

## Table widths

- Derive one width per column from the widest visible cell. Ignore semantic source markers.
- Keep similar columns equal. Clamp ordinary columns to 60%–180% of an equal share and 70%
  overall.
- Let columns with at most two visible characters use their natural share below that floor.
- Apply each width to every row so column boundaries stay aligned.

## Decision log

- Keep the feature entirely in the plugin; do not modify Paseo core.
- Support Paseo 0.9.2 and newer clients.
- Treat Markdown parity as a release gate, not a later enhancement.
- Use colour independently from Markdown emphasis: non-bold stays non-bold.
- Defer unrestricted HTML and spoilers.
