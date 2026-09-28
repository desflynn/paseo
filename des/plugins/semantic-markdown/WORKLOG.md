# semantic-markdown build log

Started 2026-09-27 ~23:35 IST. Base: junk/semantic-markdown-plugin (vendored Paseo 0.9.2 renderer).
Proven facts: see memory `plugin-mobile-hermes` and des/plugins/render-probe (commit 83536ecb0).

## Done

- Copied source; prebundle imports → real packages (markdown-it, @getpaseo/highlight, htmlparser2, react-native-markdown-display).
- Mermaid page = exact 0.9.2 html.gen.ts. Native host = port of 0.9.2 host.native.tsx (fence/mermaid/native-host.tsx) on the probe's RNCWebView + Android hash channel.
- KaTeX removed → shared/tex-unicode.ts (8/8 tests green).
- Code theme + app theme read from AsyncStorage (client/app-settings.ts); link colour = 0.9.2 accentBright table.
- client/main.ts → build.mjs (esbuild + @react-native/babel-preset) → client/main.lowered.js; entry imports that.
- Debug: client/debug.tsx error boundary + build stamp; transformer try/catch. Keep until stable.

- 52/52 tests, typecheck clean, daemon compile OK (5.7 MB), Node setup check with real React OK.
- Gotchas fixed: markdown-it \_\_toESM (require shim); main.lowered.d.ts hand-written (boundary check walks type graph into source → punycode).
- Installed from des/plugins/semantic-markdown 23:45 IST (build 22:42:39Z); render-probe disabled.

- Phone showed "Object is not a function" at LOAD (23:46). Fix 23:47: index.client.tsx requires main.lowered.js inside try/catch; on failure it claims our-syntax messages and renders a LOAD FAILED card with stack (plain Text, no classes). Reloaded 23:47 IST.

- Phone LOAD FAILED card (23:50) showed: host React namespace has typeof memo=object but default.memo=function. Fix 23:52: build.mjs reactNormalizeShim routes EVERY plugin react import through one module that uses HostReact.default when it is real React, re-exporting each API by name. Reloaded 23:52 IST, build 2026-09-27T22:52:19.932Z.
- Des: my chat prose got claimed by the renderer. NEVER write our syntax (curly kind tags, ==, [!kind], dollar math, [^n], kbd tags) in chat except in a deliberate sample message.
- index.client.tsx has load-time try/catch + LOAD FAILED card + host React diagnostics (debug until stable). Its fallback OUR_SYNTAX regex matches any dollar sign (too broad; only used on load failure).

## Full sample on phone (build 22:59:22Z, checked 2026-09-28)

OK: plain text, bold/italic, link colour (claude theme), code highlight, callout colours+icons, fold toggle, untitled info card, build line.
BROKEN:

1. Highlights: label "3. Highlights." lost; "ask" bold with no background; "·" separator after ask lost (askdone). Others OK.
2. Tag lines: no colour, no label/icon, no paragraph gap (next heading touches).
3. Callout without fold marker: title goes into body (grammar treats it as body line; Obsidian treats it as title). Fix in shared/spike.ts CALLOUT rule.
4. Callout with +/-: title AND kind label missing in header (only icon + chevron).
5. Math inline + block: text colour near-black on dark (theme colour not applied).
6. Footnote: raw "[^1]" in dark colour; definition at end not shown.
7. Mermaid: plain code block, no diagram.
   kbd: draws like inline code; check vs intent.

- 00:07 IST: items 3+4 FIXED on phone (title = rest of line; headerPressable no longer a row).
- 00:11 IST: items 1, 2, 5 fixed, awaiting phone. Highlight inner parse into own list (spike.ts); `text` rule colours from nearest tag/highlight parent; tag line = paragraph block; math/raw footnote merge inheritedStyles. 54/54. Des: "Superb" (all pass).
- 00:14 IST: item 6 footnotes, awaiting phone. Cause: renderer parses per block, never numbered. Fix: footnote_number core rule + setMessageFootnotes (whole-message map on each parser), footnote map in block keys. 55/55. PASSED on phone. Then footnote text opacity 0.66 and ref as Unicode superscript (passed).
- 00:19 IST: item 7 Mermaid. Host shows source until a rendered reply; none arrives on phone. WebView component = probe's. Added debug event trail under the fence (native-host.tsx). Awaiting screenshot.
- Trail (00:23): loadingStart https base → loadingFinish → send render r1 → loadingStart data:…base64 → loadingFinish. WebView reloads html WITHOUT baseUrl; request lost. RNCWebViewManagerImpl keeps ONE mPendingSource for all views; app's own Mermaid (no baseUrl) was on screen → crosstalk suspected, unproven. 00:26: recovery = on data: reload, remount (key=generation) with fresh driver, max 2. Awaiting phone.
- Debug lesson: never log from a per-render effect; setState in log looped the render.
- 00:29 trail: every loadingStart url = "data:text/html;charset=utf-8;base64," len 36 → EMPTY page reload, repeated after each re-render. Initial mount had the full page on https. Conclusion: prop update after mount re-sends source empty. 00:31: NativeWebView memo + all props stable (handlers via ref, style memo). Crosstalk theory dropped. Awaiting phone.
- 00:31 result: STILL loops (memo did not help). Correction: RNC Android emits loadingStart from doUpdateVisitedHistory; 36-char data: URL = loadDataWithBaseURL with EMPTY base (full page, not blank). On data: page every hash reply reloads → my 00:27 per-load driver reset made it an infinite loop. 00:36: send cap 3 per view (debug guard). Unknown: what moves the page off the https base after first send. Next: compare with render-probe on the phone now.
- 00:38 probe (reinstalled as id render-probe-tracked from des/plugins/render-probe, old id render-probe still points at missing junk path): probe ALSO loads on data: and gets no reply ("not rendered"; its diagram shows only because its WebView is always visible). Not my port; the https base is no longer honoured on the phone.
- 00:40: reply channel = window.open(MESSAGE_URL#data) → onOpenWindow (hasOnOpenWindowEvent + javaScriptCanOpenWindowsAutomatically). No navigation, so no reload on data:. Hash code + remount hack removed. Awaiting phone. Disable render-probe-tracked after.
- 00:40 result: reply arrives (rendered r1, page on https), box blank. 00:41 opacity guess = WRONG (reverted). 00:42: preview WebView had no flex:1 (RNC JS wrapper normally adds it) → 0 high. Fixed + onLayout sizes in trail. 00:43 PHONE: diagram drawn, box 240→70. ALL 7 ITEMS PASS. render-probe-tracked disabled.
- 00:48: debug output behind flags, all false: MERMAID_DEBUG (native-host.tsx, trail), PLUGIN_DEBUG (client/debug.tsx render-crash card → plain original text when off; index.client.tsx LOAD/SETUP/PARSE cards → Paseo renders when off). Build line kept (unflagged).
- Pending: full-sample rerun; strip debug trail when Des calls it stable; commit on Des's word.

## Pending

- Des force-stops app, checks the card on the 23:47 sample message: does it render now?
- Then post ONE labelled sample: plain text colour, plain+bold/italic (old plugin forced weight 600), all six highlight kinds, six callout cards (+/- fold, custom title), links (app-theme colour), math, footnote, kbd, ts code, mermaid.
- Des to screenshot the LOAD FAILED stack (or the rendered sample) from the 23:47 sample message.
- Fix from the stack; Node check with real React (/tmp/run-contrib-real.cjs) passes, so the fault is Hermes/host-specific.
- Mac hermes CLI is NOT a phone stand-in (segfaults on classes; Proxy stubs break namespace copies).
- Commit when Des says.
