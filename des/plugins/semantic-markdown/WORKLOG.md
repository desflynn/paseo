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
- 2026-09-28 19:06 IST Links in claimed messages: plugin-only avenue exhausted. SharedMarkdownLink identical to app; web press path = Pressable → onLinkPress → SDK openExternalUrl (http(s) only). Absolute-path and file:// targets are dropped by the SDK; only app-internal useAssistantFileLinkActions opens them. Selection commit 6dd80c069 changes selectable only, no press handling. No files changed. Accepted limit per Des.
- 2026-09-28 path-link plan (Des: desktop AND mobile, no core change, report to Des in chat only, NEVER message other agents):
  Chat path click in core → useAssistantFileLinkActions → onOpenWorkspaceFile → file tab. Plugin route to same tab:
  Linking.openURL(`paseo://h/${host.id}/workspace/${wsSeg}?open=${encodeURIComponent("file:" + base64urlNoPad(path))}`)
  (app scheme "paseo"; route parser utils/host-routes.ts parseWorkspaceOpenIntent; wsSeg = workspaceId if /^[A-Za-z0-9._~-]+$/ else BASE64 prefix + b64url — see encodeWorkspaceIdForPathSegment).
  workspaceId: getPaseoClient(host.id).fetchAgent(agentId) → check result field. http(s) links unchanged. TDD the URL builder (shared/). Then reload + Des click-test the exact PLAN.md line.
- 19:25 IST HANDOFF (path links). Built + reloaded (98/98): shared/file-link.ts (+test, added to package.json test script; backup package.json.bak-20260928-links), client/semantic-markdown.tsx LinkPressContext + handleLinkPress (local path/file:// → agents.ref(agentId).refresh() → workspaceId → Linking.openURL(paseo://h/<srv>/workspace/<ws>?open=file:<b64url>)); http(s) unchanged.
  EVIDENCE: `open paseo://h/srv_yu4vmxb9yxXW/workspace/wks_6ce4b723eb75eeca?open=file:…` did NOT open a file tab on desktop. Cause: packages/desktop/src/main.ts:858 open-url → receiveAgentDeepLink only (agent links). NEXT: on web/desktop navigate IN-APP: window.history.pushState(null,"",route) + dispatchEvent(new PopStateEvent("popstate")) with route "/h/<srv>/workspace/<ws>?open=file:<b64>"; native keeps Linking.openURL("paseo:/" + route). Then verify by screenshot (file tab appears), then Des click-tests desktop + phone.
  SECURITY: my env grep printed PASEO_DAEMON_PASSWORD into transcript at ~19:22 IST; told Des to rotate. Never print env values.
  RULE: report to Des in this chat ONLY; never message other agents.
- 19:24 IST: web → history.pushState+popstate in-app; native → Linking paseo:// deep link. 99/99, tsc clean, reloaded. UNVERIFIED by click (agent may not click to act): Des to click-test desktop + phone.
- 19:3x IST HANDOFF: Des click-test of 19:24 build = NOT WORKING ("something flashes up", no file tab). Des: main renderer opens BOTH inside- and outside-workspace paths. So path location is not the cause.
  Route consumer: packages/app/src/app/h/[serverId]/workspace/[workspaceId]/index.tsx:114-183 reads useGlobalSearchParams().open → prepareWorkspaceTab({target:{kind:"file",path}}) once per consumptionKey server:ws:open. Suspect: my pushState+popstate resets the root nav (the flash) but globalParams.open never reaches the route, or the reset drops it. NEXT: find an in-app navigation the router honours (expo-router router.push equivalent reachable from plugin, e.g. Linking.openURL on web? or navigation via a URL the router parses) — get EVIDENCE (a log line / screenshot) before asking Des to click again.
- 19:4x IST HANDOFF: DESKTOP PATH LINKS WORK (Des: "works now") with 19:35 build: web reads /h/<srv>/workspace/<ws> from window.location and pushes ?open=file:<b64url> + popstate (shared/file-link.ts workspaceFileRouteFromPath; 100/100).
  OPEN: phone. Native path still uses getPaseoClient(host.id).agents.ref(agentId).refresh() which HUNG on desktop (never resolved). Des rejects "give up" timeouts (cantitis). Suspect host.id != serverId expected by getPaseoClient. Next: phone click-test; if grey line says lookup timed out, find a lookup that works (log host.id; try agents.list / useHosts snapshot for serverId). Then remove the grey link-debug line (client/semantic-markdown.tsx linkDebug) once both platforms pass. Nothing committed.
- 19:37 IST: second-click fix (route dedupes same open value; alternate %-escaped first b64 char). Reloaded. Awaiting Des.
- 19:45 IST HANDOFF (phone path links): evidence = click1 opens; click2+ "openURL returned" but nothing until app restart. Cause (Paseo comment workspace index.tsx:164): Expo Router ignores query-only changes. FIX IN PROGRESS: shared/file-link.ts workspaceFileRoute odd clicks escape first char of workspace SEGMENT (%25XX…; router decodes once, Paseo decodeSegment again → same ws) in lockstep with payload escape. Test "phone links change the path per click" is RED; implement in workspaceFileRoute, run npm test, reload, Des clicks 3x on PHONE (Des is on MOBILE). Screenshot block = Paseo-specific on mobile (NOT Intune; after a Paseo storage clean + my changes) — investigate next. Report ONLY to Des; never message other agents.
- 19:56 IST: SCREENSHOT FIX built + reloaded (103/103, tsc clean). Bisect proved window.open (hasOnOpenWindowEvent/javaScriptCanOpenWindowsAutomatically) blocks phone screenshots. New Android Mermaid reply channel: shim sets location.href=https://paseo-plugin.invalid/msg?<data>; onShouldStartLoadWithRequest (Android only) calls RNCWebViewModule.shouldStartLoadWithLockIdentifier(false, lockIdentifier) via native-webview.tsx answerLoadRequest, then handleData. Window-open props removed. spike.test.ts stub line gained NativeModules + TurboModuleRegistry. Awaiting Des: force-stop, diagram draws?, screenshot works? Then: phone second-click path links.
- 19:59 IST: phone 2nd-tap PROBE live (103/103). Traced code: no dedupe in Paseo (\_layout OfferLinkListener only pairing links) or Expo Router 6.0.23 useLinking.native; decodeWorkspaceIdFromPathSegment decodes escaped seg OK. Probe: module Linking 'url' counter; grey line shows 'click N: seg … · app got M links · last = this|…'. Des to tap same path link 2x, report both lines. M not rising = Android never delivers; M rising = router drops it.
- 20:07 IST: probe 1 result (Des): 6 taps, app got 6 url events, last = this → Android delivers every link; router/tab side drops tap 2+. Taps 3+ repeat tap 1/2 open values → Paseo consumedIntentRef dedupe, so ONLY tap 2 matters. Paseo's own chat link (workspace-screen.tsx:2187 handleOpenFileFromChat) also calls showMobileAgent() + requestFileNavigation + focus. Probe 2 live: after each tap, reads AsyncStorage workspace-layout-state → 'focus <tab> · file tab <tab> (FOCUSED)'. client/app-settings.ts readRaw(key) exported.
- 20:19 IST: Des chose Plan B (Q1). Delegated to OG2DS: fiber walk from a plugin class component to Paseo's pane context (screens/workspace/workspace-pane-content.tsx stablePaneContextValue: serverId, workspaceId, openFileInWorkspace), call openFileInWorkspace({location:{path}, disposition:'preferred'}) like components/message.tsx:1526. Deep link stays fallback.
- OG2DS 20:21 IST: start. Fiber-walk plan: pure findPaneHandler in shared/file-link.ts (TDD red first), class probe in client/semantic-markdown.tsx, deep link stays fallback.
- OG2DS 20:22 IST: shared/file-link.ts: exported localFilePath, added FiberLike/PaneHandler/PaneHandlerSearch + findPaneHandler (shape match on memoizedProps.value, cap 500). Tests red then green: shared/file-link.test.ts 14/14.
- OG2DS 20:23 IST: client/semantic-markdown.tsx: PaneHandlerProbe class (mount walk), press path calls pane openFileInWorkspace({location:{path},disposition:"preferred"}) when found, deep link fallback with grey line. Removed urlEvents listener, describeLayout, layout read probe. Full suite 106/106, tsc clean. Plugin reloaded: running. Not device-tested (no tap).
- 20:28 IST: PHONE PATH LINKS WORK (Des: SUCCESS) via Plan B pane handler. Left: desktop 2-tap check, Mermaid draw confirm, then remove grey linkDebug + deep-link fallback if Des wants. Not committed.
- 20:37 IST: Des Q2=A. Mermaid Android channel restored to render-probe's proven hash/pushState shim (#paseo-plugin-msg=, read in onLoadingStart). Removed onShouldStartLoadWithRequest/answerLoadRequest (they route via app's RNCWebViewMessagingModule, never reach plugin) and spike stub extras. MERMAID_DEBUG still true. Link files (semantic-markdown.tsx, file-link.ts) untouched since 20:22. 106/106, tsc clean, reloaded.
- OG2DS-B 20:45 IST: read native-host.tsx, native-webview.tsx, index.tsx, runtime/{entry,messages,request-driver}.ts, presentation.ts, use-render-model.ts, render-model.ts, build-runtime.mjs. Link-file hashes before: semantic-markdown.tsx 32e724387cc69053602c30131c55a17b8fe6f646, file-link.ts e3948b3b53bf61b5e9e588182ce8c19748d90252. Android plan: fixed box, no reply channel.
- OG2DS-B 20:45 IST: native-host.tsx changed. Android shim: local postMessage (renderError -> body error text in #diagram, others dropped), fit CSS injected; HASH_PREFIX/onLoadingStart hash branch/sendCountRef cap removed; Android sends each revision once after loadingFinish (driver kept for iOS); Android fixed PREVIEW_HEIGHT=240 box shown while status pending, no code-block fallback; viewer uses state source when visible is null; MERMAID_DEBUG=false.
- OG2DS-B 20:45 IST: checks: npm test 106/106 pass 0 fail (/tmp/sm-test-og2b.txt), npm run typecheck exit 0 (/tmp/sm-tc-og2b.txt), ANDROID_BRIDGE extracted and node --check clean, plugin reload exit 0, plugin ls: running enabled. Link-file shasums unchanged: semantic-markdown.tsx 32e724387cc69053602c30131c55a17b8fe6f646, file-link.ts e3948b3b53bf61b5e9e588182ce8c19748d90252. Not device-tested.
