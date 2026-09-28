# Vendor plan — Paseo 0.9.2 Markdown renderer → semantic-markdown-plugin

Inventory only. Sources inspected at tag `v0.9.2`. Parity target: `DESIGN.md` in this directory.

## Summary

The 0.9.2 assistant Markdown pipeline is ~2,700 LOC of portable rendering code plus a small set of app-only couplings (theme, clipboard, i18n, native containers). The plugin SDK already provides replacements for most couplings: `copyText`, `useRevealedText`, `Icon`, `Modal`, `theme`/`layout.platform` props. The two genuine risks are (1) native-module availability in plugin bundles (`react-native-uitextview`, `react-native-webview`) and (2) the `react-native-markdown-display` patch that must be applied before prebundling.

## File inventory (v0.9.2)

All paths relative to `packages/app/src/` unless noted.

### Tier 1 — copy verbatim (no app couplings)

| File                                                          | LOC  | Role                                                                                            |
| ------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------- |
| `utils/markdown-parser.ts`                                    | 19   | The one parser factory (`html:false`, typographer off — copy-paste safety rationale lives here) |
| `utils/assistant-markdown-parser.ts`                          | 19   | `file://` validateLink allowance + streaming toggle                                             |
| `utils/markdown-ast.ts`                                       | 12   | `markdownNodeContainsType`                                                                      |
| `utils/split-markdown-blocks.ts`                              | 92   | Block splitter for streaming                                                                    |
| `utils/streaming-markdown/index.ts`                           | 153  | markdown-it inline rules for streaming tokens                                                   |
| `components/markdown/html-ish.ts`                             | 766  | `<details>`, inline `<img>`, `<a><img>` extraction; safe-src/href policies                      |
| `components/markdown/inline-image-size.ts`                    | 63   | Inline image dimension parsing                                                                  |
| `components/markdown/part-groups.ts`                          | 89   | Groups image/text parts                                                                         |
| `components/markdown/link-children.ts`                        | 21   | Link text colouring helper                                                                      |
| `components/markdown/fence/language.ts`                       | 3    | Fence info-string → language                                                                    |
| `components/markdown/fence/types.ts`                          | 10   | `MarkdownPhase`, `MarkdownFenceRendererProps`                                                   |
| `components/markdown-text-selection.tsx`                      | 17   | Table-cell vs prose selection context                                                           |
| `components/markdown-text-style.ts`                           | 25   | Plain-text style resolution                                                                     |
| `styles/code-surface.ts`                                      | 7    | `CODE_SURFACE_DATASET`                                                                          |
| `assistant-selection-copy/markup.ts`                          | ~120 | Pure `data-paseo-*` dataSets + trailing-breaks regex (copy the data; see §App-only)             |
| `hooks/use-stable-event.ts`                                   | 10   | Stable callback ref                                                                             |
| `components/markdown/fence/mermaid/render-model.ts`           | ~200 | Mermaid render request/model types + logic                                                      |
| `components/markdown/fence/mermaid/source-policy.ts`          | 52   | Unsafe-source guard                                                                             |
| `components/markdown/fence/mermaid/runtime/messages.ts`       | 91   | iframe message protocol                                                                         |
| `components/markdown/fence/mermaid/runtime/request-driver.ts` | 63   | Request queueing                                                                                |
| `components/markdown/fence/mermaid/use-render-model.ts`       | 96   | React reducer around render-model                                                               |
| `components/markdown/fence/mermaid/presentation.ts`           | ~50  | Diagram box styles                                                                              |
| `components/markdown/fence/mermaid/runtime/html.gen.ts`       | gen  | Generated iframe HTML (see build step)                                                          |

### Tier 2 — copy with small adapter seams

| File                                   | LOC | Seams                                                                                                                                                                                                                                          |
| -------------------------------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/markdown/renderer.tsx`     | 780 | The hub. Replace `withUnistyles(Markdown)` + `StyleSheet.create((theme)=>…)` mapping with a `theme` prop; `HighlightedCodeBlock` → plugin CodeBlock via fence seam; `openExternalUrl` → link-handler seam; `isNative` → `layout.platform` prop |
| `styles/markdown-styles.ts`            | 422 | Needs `Theme` shape + `FONT_SIZE` + `isWeb`; port with a theme adapter and inlined font constants                                                                                                                                              |
| `utils/markdown-list.ts`               | 147 | Imports `SPACING` only — inline the 3–4 spacing values used                                                                                                                                                                                    |
| `components/markdown/fence/index.tsx`  | 42  | `HighlightedCodeBlock` import → plugin CodeBlock                                                                                                                                                                                               |
| `components/markdown/link-text.tsx`    | 41  | Local `use-stable-event` copy; rest is plain RN                                                                                                                                                                                                |
| `components/markdown-text.web.tsx`     | 73  | `markdownCopyDataSet` + `CODE_SURFACE_DATASET` copies cleanly                                                                                                                                                                                  |
| `components/markdown-text.android.tsx` | 56  | Plain Text/View; copies cleanly                                                                                                                                                                                                                |
| `components/markdown-text.ios.tsx`     | 113 | Uses `react-native-uitextview` — see risks; needs Text fallback variant                                                                                                                                                                        |
| `components/markdown-text.d.ts`        | 1   | Re-export shim, keep                                                                                                                                                                                                                           |

### Tier 3 — rewrite as thin plugin components (heavy app couplings)

| File                                                          | LOC | Couplings                                                                  | Plugin replacement                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------- | --- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/highlighted-code-block.tsx`                       | 249 | expo-clipboard, react-i18next, unistyles, layout hook, syntax-token-styles | New `CodeBlock.tsx`: tokenize via prebundled `@getpaseo/highlight`, copy via SDK `copyText`, hardcoded strings, plain StyleSheet + theme prop. Reuse `utils/highlight-cache.ts` (pure, LRU + `MAX_HIGHLIGHT_CHARS`) and `styles/syntax-token-styles.ts` (40 LOC, unistyles → plain map) |
| `components/markdown/fence/mermaid/host.web.tsx`              | 193 | i18next, lucide, unistyles                                                 | Adapt: SDK `Icon`/`Modal`, hardcoded strings; keep code/diagram toggle                                                                                                                                                                                                                  |
| `components/markdown/fence/mermaid/host.native.tsx`           | 379 | react-native-webview, i18next, lucide, unistyles                           | Adapt same way; WebView availability gated — see risks                                                                                                                                                                                                                                  |
| `components/markdown/fence/mermaid/fullscreen-viewer.web.tsx` | 140 | safe-area-context, ZoomableViewport, desktop-window                        | Port simplified (SDK `Modal`, no viewport zoom) or defer; fullscreen is UX sugar, not in DESIGN parity list wording ("Mermaid diagrams" is)                                                                                                                                             |
| `fence/mermaid/build-runtime.mjs`                             | 81  | esbuild + mermaid                                                          | Keep as plugin build step producing `html.gen.ts` (mermaid never enters the client bundle)                                                                                                                                                                                              |

### Not vendored — host provides, or app wiring reimplemented in plugin

- `components/message.tsx` streaming loop (~80 relevant LOC): `splitMarkdownBlocks` + last-block-gets-streaming-parser + copy-rule overrides (heading dataSets, unwrap, list markers). This logic moves into the plugin's `SemanticMarkdown` timeline renderer using SDK `useRevealedText(text, phase)`.
- `assistant-selection-copy/surface.web.tsx`, `content.web.ts` — app-owned DOM selection manager. Plugin only emits the same `data-paseo-*` attributes. Coverage of plugin timeline items must be verified (§Risks).
- `utils/open-external-url.ts` — replace with `Linking.openURL` (native) / `window.open` (web) behind the link-handler seam.
- `constants/platform.ts` — 3-line local re-implementation from `Platform.OS`, or `layout.platform` prop.
- expo-clipboard → SDK `copyText`; react-i18next → hardcoded strings; lucide-react-native → SDK `Icon`; react-native-unistyles → plain `StyleSheet` + theme prop; `@/desktop/host` → dropped.

## Dependency graph

### External npm deps (app, v0.9.2) and their plugin fate

| Dep                                                                                    | App version                    | Fate                                                                                     |
| -------------------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------- |
| `markdown-it`                                                                          | **10.0.0** (lockfile-resolved) | Prebundle. **Scaffold has ^14.1.0 — downgrade to 10.0.0 or token shapes/behavior drift** |
| `react-native-markdown-display`                                                        | 7.0.2 + 74-line patch          | Prebundle, patch applied to source first (see §Risks)                                    |
| `htmlparser2`                                                                          | ^12.0.0                        | Prebundle (html-ish.ts)                                                                  |
| `@getpaseo/highlight`                                                                  | 0.9.2 workspace dist           | Prebundle `dist` (CodeMirror/lezer tokenizer, pure JS)                                   |
| `mermaid`                                                                              | ^11.16.0                       | Only inside the iframe runtime bundle via `build-runtime.mjs`; never in client bundle    |
| `react-native-uitextview`                                                              | ^2.2.0                         | **Host-availability risk** (iOS selection) — fallback to `Text`                          |
| `react-native-webview`                                                                 | ^13.16.0                       | **Host-availability risk** (native mermaid)                                              |
| react-i18next / expo-clipboard / expo-linking / lucide / unistyles / safe-area-context | —                              | Dropped, replaced as above                                                               |

The SDK-provided modules (`react`, `react-native`, `@getpaseo/plugin`) stay external to every esbuild prebundle.

### Internal import graph (renderer closure)

```
renderer.tsx ─┬─ markdown-parser / assistant-markdown-parser ─── streaming-markdown
              ├─ html-ish ── htmlparser2
              ├─ part-groups, inline-image-size, link-children, link-text ── use-stable-event
              ├─ markdown-ast, markdown-list ── theme(SPACING)
              ├─ markdown-styles ── theme(Theme,FONT_SIZE), platform(isWeb)
              ├─ markdown-text{.ios,.android,.web} ── markdown-text-style,
              │        markdown-text-selection, selection-copy/markup, code-surface
              ├─ markdown-text-selection
              ├─ open-external-url [seam] ── platform
              └─ fence/index ─┬─ fence/language, fence/types
                              ├─ HighlightedCodeBlock [seam] ─┬─ @getpaseo/highlight
                              │                               ├─ highlight-cache
                              │                               └─ syntax-token-styles
                              └─ mermaid/host{.web,.native} ─┬─ render-model, source-policy,
                                                             │  use-render-model, presentation
                                                             ├─ runtime/html.gen (generated)
                                                             └─ runtime/{messages,request-driver}
```

## Version drift

`git diff --stat v0.9.2 HEAD` over the entire renderer tree (all Tier 1–2 files, selection-copy markup, markdown-styles) is **empty** — current `main` is identical to the tag for this closure. Vendor from the tag for provenance; there is no drift to reconcile.

## Platform-specific risks

1. **Native modules in plugin bundles (biggest unknown).** `markdown-text.ios.tsx` imports `react-native-uitextview`; `mermaid/host.native.tsx` imports `react-native-webview`. Both are linked in the host app, but plugin bundles resolve modules through the host's module map and neither is a documented SDK export. Verify against `@getpaseo/plugin`'s client bundle loader **before** porting. Fallbacks: iOS spans degrade to `Text` (lose native UITextView selection polish; web/desktop unaffected); native mermaid degrades to a plain code block or a "diagram unavailable" note. Web + Electron — where mermaid runs in a plain iframe and selection is CSS — are unaffected either way.
2. **The rnmD patch must precede bundling.** The 74-line patch (deterministic AST keys `rnmr_<path>_<type>` replacing random `getUniqueID()`) is what keeps streaming re-renders from remounting the whole tree. Apply it to a vendored copy of `react-native-markdown-display` source, then esbuild that — do not attempt to patch the bundle. Without it, streaming parity fails (remounts per token).
3. **markdown-it version.** App pins 10.0.0 exactly. The scaffold's ^14 changes inline-rule internals the vendored `streaming-markdown` and `html-ish` code was written against (plus rnmD's AST expectations). Pin 10.0.0.
4. **Selection/copy consumer coverage.** The `data-paseo-*` attributes are only half the feature; the DOM-side selection manager (`assistant-selection-copy/surface.web.tsx`) is app-owned. Verify it observes plugin-rendered timeline items; if it scopes to app containers only, copy parity on web degrades to per-block SDK `copyText` buttons. Document the finding before calling parity done.
5. **Theme shape.** `markdown-styles.ts` consumes the app's `Theme` (863 LOC: spacing scale, `FONT_SIZE`, color tokens) through unistyles. The plugin adapter maps SDK `PluginTheme` colors onto the consumed subset; font sizes and spacing values get inlined as constants. Visual parity on colors is only as good as `PluginTheme`'s token set — check it covers text/muted/border/code-surface tones the styles need.
6. **Fullscreen mermaid extras** (safe-area insets, `ZoomableViewport`, desktop window regions) are app components. DESIGN requires mermaid rendering, not pinch-zoom fullscreen; ship a simplified web modal or defer fullscreen.

## Focused parity tests

Port these existing suites (they are renderer-pure and run in vitest, no app shell):

- `components/markdown/html-ish.test.ts` (348 LOC) — details blocks, inline images, linkify safety, protection of fenced regions. The heart of the parity gate.
- `components/markdown/part-groups.test.ts` (92), `renderer.test.ts` (99)
- `fence/mermaid/source-policy.test.ts` (72), `runtime/request-driver.test.ts` (52), `runtime/runtime.browser.test.ts` (146)
- `fence/language.test.ts` (15)
- `utils/__tests__/split-markdown-blocks.test.ts`, `utils/assistant-markdown-parser.test.ts`
- New: a golden corpus test — a fixture file exercising every DESIGN parity bullet (headings → tables, details, mermaid fence, file:// link, inline image) rendered through the plugin renderer with snapshot assertions, run on desktop web first.
- Manual/browsed verification borrowed from e2e specs: `e2e/browser/streaming-markdown.spec.ts` and `mermaid-streaming.spec.ts` behaviors (stream reveals without remount; fence shows placeholder until complete), checked in the Paseo desktop app with the plugin installed.

Plugin-specific additions (not parity): the semantic extensions get their own small rule tests only after the parity gate passes.

## Ordered implementation plan (smallest first)

1. **Prebundle pipeline.** Pin markdown-it 10.0.0. Extend `build` to esbuild-bundle `markdown-it`, `react-native-markdown-display` (patched copy), `htmlparser2`, `@getpaseo/highlight` → `shared/*.js` with `--platform=neutral`, externals `react`, `react-native`, `@getpaseo/plugin`. Gate: spike renders a fenced block.
2. **Tier 1 verbatim copy** + local `constants/platform.ts` + theme-types stub. Gate: html-ish/part-groups/split-blocks tests ported and green.
3. **Theme adapter + markdown-styles** port. Gate: styles resolve against `PluginTheme` without unistyles.
4. **renderer.tsx port** with three seams: `CodeBlockComponent` (default = plugin CodeBlock), `onOpenLink` (default Linking/window.open), `platform` (from `layout.platform`). Gate: renderer.test.ts green.
5. **markdown-text variants** + selection dataSets; iOS falls back to `Text` until uitextview availability is proven. Gate: golden corpus renders headings/tables/lists/links/images on web.
6. **CodeBlock** (highlight-cache + syntax-token-styles + `copyText`). Gate: fenced code shows tokens + copy works on web.
7. **Mermaid**: `build-runtime.mjs` step → `html.gen.ts`; web host via SDK `Modal`/`Icon`; native host gated behind WebView availability check. Gate: mermaid-streaming behavior on desktop.
8. **Streaming integration** in `SemanticMarkdown`: `useRevealedText` + `splitMarkdownBlocks` + dual parser (last block streaming) + ported copy-rule overrides. Gate: streaming spec behaviors hold; no remount churn.
9. **Parity gate review** against DESIGN "Required parity", then extensions (semantic colour/highlight rules, callouts, math, footnotes, kbd) as markdown-it rules.

Steps 1–4 unblock everything else; 5–8 are independently revertible. Skipped until needed: fullscreen zoom (risk 6), native UITextView (risk 1), i18n.

---

## Implementation journal (2026-09-27)

Gates follow the ordered plan above. All work confined to `junk/semantic-markdown-plugin`.

### Gate 1 — Prebundle pipeline ✅

- `build-prebundle.mjs` (esbuild, `--platform=neutral`, externals `react`, `react-native`, `@getpaseo/plugin*`): markdown-it@10.0.0 → `shared/markdown-it.js`, patched rnmD 7.0.2 → `shared/markdown-display.js` (JSX loader, automatic runtime), htmlparser2 → `shared/htmlparser2.js`, @getpaseo/highlight dist → `shared/highlight.js` (1.6 MB, lezer), katex → `shared/katex.js`.
- **markdown-it pinned 10.0.0** (was ^14 in the scaffold); all 7 original spike tests pass unmodified against the v10 prebundle — the proven grammar survived the downgrade.
- The 74-line rnmD patch (`../../patches/react-native-markdown-display+7.0.2.patch`) is applied to the plugin's own node*modules copy with `patch -p1 -N` before bundling (forward-only; no-ops once applied). Deterministic `rnmr*\*` keys are in the bundle.
- Mermaid runtime: `vendor/.../mermaid/build-runtime.mjs` generates `runtime/html.gen.ts` (3.4 MB iframe srcdoc; mermaid never enters the client bundle).

### Gate 2 — Tier 1 verbatim copy ✅

- 22 source files vendored under `vendor/` mirroring the app tree. Only import specifiers rewritten (`@/` → relative, `markdown-it`/`htmlparser2` → prebundles). Verified: `git diff v0.9.2 HEAD` over this closure is empty, so working-tree copies are tag-exact modulo imports.

### Gate 3 — Theme adapter ✅

- `vendor/styles/theme.ts`: app scale constants (FONT_SIZE/SPACING/BORDER_RADIUS/FONT_WEIGHT, mono font stack via Platform.select) inlined from v0.9.2 theme; `themeFromPlugin()` maps the 11 PluginTheme color tokens onto the consumed subset (`accentBright` ← `accent`). `isDarkSurface()` picks palettes.

### Gate 4 — renderer.tsx port ✅

- Seams: `withUnistyles`/`uniProps` → explicit `theme` prop; `openExternalUrl` ← SDK; `isNative` ← local platform constants; lucide chevrons ← SDK `Icon`; unistyles themed StyleSheet → `createDetailsStyles(theme)`. `createSharedMarkdownRules(ctx)` now takes `{ theme, dark }`.
- CodeBlock seam: vendored `HighlightedCodeBlock` uses SDK `copyText`, SDK `Icon`, hardcoded strings (no i18n), inline spacing constants, `syntaxTokenStylesFor(dark, foreground)` with the app's exact dark/light highlight palettes from `@getpaseo/highlight`.

### Gate 5 — markdown-text variants ✅ (degraded on iOS, see Limitations)

- Platform variants collapsed into one `vendor/components/markdown-text.tsx` (the plugin compiler is platform-neutral — no `.web/.native` file resolution). Web: `data-paseo-*` dataSets + userSelect styles. Android/iOS: `<Text selectable>`. **Selection/copy is blocking parity** (2026-09-27 course correction): every text rule routes through `MarkdownTextSpan`/`MarkdownInheritedText`; assistant copy rules ported (heading/blockquote/hr/table/list/copyTag dataSets + list markers).
- renderer.test.ts NOT ported (needs @testing-library/react — no JSX test runner in the plugin). Its coverage moved to the golden corpus + live matrix.

### Gate 6 — CodeBlock ✅

- highlight-cache (LRU + 100k cap) + copy button via SDK `copyText`, trailing-newline stripping preserved.

### Gate 7 — Mermaid ✅ web / degraded native

- Web host: simplified from host.web.tsx (no ZoomableViewport, no fullscreen — risk 6 deferral), iframe created imperatively (neutral-compile-safe), source↔diagram toggle kept, measuring pass kept.
- Native: degrades to highlighted `mermaid` code block (no react-native-webview in plugin bundles — risk 1).

### Gate 8 — Streaming ✅ (phase-less)

- `SemanticMarkdown` splits with `splitMarkdownBlocks`; the **last block always uses the streaming parser** (`createAssistantMarkdownParser({streaming:true})` + semantic rules) — correct for complete text, graceful for live tails. Timeline items expose no streaming phase, so paced reveal stays host-owned (Limitations).

### Gate 9 — Parity gate + extensions ✅ parser-level

- Extensions as markdown-it rules in `shared/extensions.ts`: inline/block math (pandoc whitespace guards, escape/code-span immunity), footnotes (refs + defs, first-ref numbering, unresolved→literal, unreferenced→hidden; block rule registered **before `reference`** — single-word defs are valid link-reference definitions and get swallowed otherwise), `<kbd>`.
- Callout grammar extended: `> [!type]+ Title` (fold-open) / `> [!type]- Title` (fold-collapsed) with `meta {kind, title, fold}`; markerless form byte-compatible with the proven grammar (rest-of-line = first body line).
- Detection claims messages containing any `semantic_ | math_ | footnote_ | kbd` token — the vendored renderer IS the parity renderer, so claiming is safe.
- Colour stays independent of emphasis (no fontWeight on plain/highlight) per DESIGN decision log.
- Math rendering: KaTeX **MathML output** injected into a DOM node on web/Electron (no katex.css/fonts needed; MathML Core is native in Electron + browsers); monospace TeX fallback on native. Arbitrary HTML stays excluded.

### Checks (all green 2026-09-27)

- `npm test` — **150/150** (30 grammar+extensions, 6 markup/selection contract, 6 golden corpus, 108 ported app parity incl. html-ish 348-LOC suite, streaming parser, split-blocks, mermaid source-policy + request-driver)
- `npm run typecheck` — 0 errors
- `npm run build` — prebundles + mermaid runtime regenerate cleanly
- Ported suites run under `node --test` via `vendor/test-shim.ts` (vitest-compat: describe/it/it.each/expect matchers used)

## Limitations (known, deliberate)

1. **iOS cross-span drag selection** — iOS uses `<Text selectable>` (per-span selection, long-press copy works). The app's UITextView-based cross-span drag needs `react-native-uitextview`, not a documented plugin-bundle export. Mobile select+copy is satisfied; drag-across-spans polish is not. Revisit if the SDK exposes the module.
2. **Paced reveal** — no phase signal on timeline items; reveal cadence is host re-render cadence. Streaming-safe tail parsing is in place.
3. **Mermaid on native** — code-block degrade (webview availability risk). Web/desktop render real diagrams.
4. **Mermaid fullscreen/zoom** — deferred (risk 6).
5. **Plugin-local formatter** — none configured; repo-root `oxfmt` runs over excluded `junk/` paths and was not run (perimeter).
6. **Web copy surfaces** — plugin emits the app's `data-paseo-*` attributes; whether the app-owned DOM selection manager observes plugin timeline items is unverified (risk 4). Copy buttons work regardless (SDK `copyText`).
7. **Inline-code file links** — the app's `fileLinkActions` resolution (assistant-file-links) is app-coupled and not ported; inline code renders as plain code.

## Live verification matrix (BLOCKING — run before calling parity done)

Selection/copy is blocking parity per the 2026-09-27 course correction. ✅ = required pass; ⚠ = degraded-but-acceptable with the noted limitation.

| Check                                            | Desktop/Electron | Web browser | iOS                     | Android           |
| ------------------------------------------------ | ---------------- | ----------- | ----------------------- | ----------------- |
| Prose selectable + copy (long-press/drag)        | ✅               | ✅          | ✅ ⚠ per-span only (L1) | ✅                |
| Semantic text `{kind}` selectable                | ✅               | ✅          | ✅                      | ✅                |
| Highlight `=={kind}…==` selectable               | ✅               | ✅          | ✅                      | ✅                |
| Callout body selectable; fold +/- toggles        | ✅               | ✅          | ✅                      | ✅                |
| Headings/lists/tables select + copy              | ✅               | ✅          | ✅                      | ✅                |
| Code block copy button                           | ✅               | ✅          | ✅                      | ✅                |
| Syntax highlight colors light/dark               | ✅               | ✅          | ✅                      | ✅                |
| Mermaid diagram renders                          | ✅               | ✅          | ⚠ L3 code degrade       | ⚠ L3 code degrade |
| `<details>` collapse/expand                      | ✅               | ✅          | ✅                      | ✅                |
| Math renders (MathML)                            | ✅               | ✅          | ⚠ L3 mono TeX           | ⚠ L3 mono TeX     |
| Footnote refs + notes section                    | ✅               | ✅          | ✅                      | ✅                |
| `<kbd>` chips                                    | ✅               | ✅          | ✅                      | ✅                |
| file:// link opens                               | ✅               | ✅          | ✅                      | ✅                |
| Streaming tail renders without remount churn     | ✅               | ✅          | ✅                      | ✅                |
| Theme switch light↔dark (palettes, code surface) | ✅               | ✅          | ✅                      | ✅                |
