# Semantic Markdown plugin

## Goal

Render semantic agent markup without losing any Markdown behavior provided by Paseo 0.9.2.
The plugin owns parsing and rendering on desktop and mobile.

## Required parity

- Headings, emphasis, links, images, lists, blockquotes, tables, and horizontal rules.
- Inline code and syntax-highlighted fenced code.
- Mermaid diagrams and collapsible details blocks.
- Paseo's selection, copying, file-link, streaming, theme, and accessibility behavior.

## Extensions

- Plain semantic colour: `{type} text`.
- Semantic highlight: `=={type} text==`.
- Foldable titled callouts: `> [!type]+ Title` and `> [!type]- Title`.
- Inline and block math.
- Footnotes.
- Keyboard keys.

Kinds are `ask`, `done`, `deferred`, `warning`, `danger`, and `info`.

## Exclusions

- Task lists.
- Workspace wikilinks.
- Spoilers for now.
- Arbitrary HTML, JSX, scripts, styles, event handlers, and iframes.

Agent output is always untrusted data. Plugin code may use React Native components; content is parsed and never executed.

## Approach

Vendor the Paseo 0.9.2 Markdown renderer into the plugin and remove app-only wiring. Preserve its behavior first, then add extensions as Markdown-it rules. Prebundle dependencies through the manifest build step so the client bundle remains compatible with Paseo's neutral plugin compiler and Hermes.

## Decision log

- Keep the feature entirely in the plugin; do not modify Paseo core.
- Support Paseo 0.9.2 and newer clients.
- Treat Markdown parity as a release gate, not a later enhancement.
- Use colour independently from Markdown emphasis: non-bold stays non-bold.
- Defer unrestricted HTML and spoilers.
