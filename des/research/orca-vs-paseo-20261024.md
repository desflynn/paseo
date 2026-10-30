# Orca against Paseo: what we have, what we lack

Written 24 Oct 2026 by the Paseo Head Guy, for Joey and Des. Comment only: nothing was installed, built, changed or restarted. I read no Orca code and no Orca pages beyond Joey's pack.

**How to read it.**

- **SOURCE** means I read it in the Paseo code or docs. Trees: `/Users/des/.paseo/worktrees/1bbd2mtm/0-13-0-df` (0.13.0-df) and `/Users/des/dev/paseo-0.12.0-df` (0.12.0-df). Paths below are under `packages/app/src` unless a docs path is named.
- **GUESS** means I inferred it, or a search found nothing.
- Every Orca claim is the vendor's or the speaker's. UNVERIFIED unless a frame in Joey's pack shows it.
- Both Paseo trees hold the same files for every row below (checked by file presence). The only 0.13-only items are `addAgentPanel`, `useTabState`, file panels and the `Markdown` UI export (`public-docs/plugins/reference.md` says "require Paseo 0.13.0 or later").

## Verdict

1. **Paseo already has the two feedback tools Orca sells.** An element picker in the desktop browser pane sends a comment plus selector, HTML, styles and the React source file and line to the agent. Diff-line comments go back to the agent as a review attachment. Both are SOURCE. The README guessed Paseo lacked them.
2. **The gap Des named is real: marking up a passage of an agent's chat reply and sending the comment back.** Paseo has nothing for it. The nearest code is a copy handler on assistant text. A plugin cannot do it today, and a small core change could. SOURCE for the absence in the app tree.
3. **Where Orca is ahead on the screen:** a Change or Question tag on each note, a "Reset now" action and an account switcher next to the usage clocks, and a keep-awake setting. All small. Paseo shows usage and reset times but has no reset action or account switch (SOURCE for the display, GUESS for the absence).
4. **Orca is not ahead on status, phone or remote.** Paseo has permission, error and finished attention states, push notifications, mark-unread, a mobile app, a host picker in the new-workspace screen and 0.13 connected hosts. All SOURCE.
5. **My ranking:** (1) chat-reply markup, (2) the usage reset and account switch, (3) the note tag plus a visible batch count. Orchestration is a DCI question, not a Paseo one.

## 1. The README's eleven rows

| #   | Orca feature                                      | Paseo 0.12.0-df       | Paseo 0.13.0-df       | Evidence                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------- | --------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Element annotation in a browser, sent to an agent | **PARTLY**            | **PARTLY**            | SOURCE: see detail A.                                                                                                                                                                                                                                                     |
| 2   | Diff-line notes sent back                         | **HAS**               | **HAS**               | SOURCE: see detail B.                                                                                                                                                                                                                                                     |
| 3   | Worktree per agent, from a dialog                 | **HAS**               | **HAS**               | SOURCE: `screens/new-workspace-screen.tsx` has a host picker (line 687). `public-docs/worktrees.md` covers worktree-backed workspaces, `paseo.json` setup and teardown, scripts and services. DCI adds harness provisioning on top (`scripts/dci-provision-worktree.sh`). |
| 4   | Orchestration skill and worker depth cap          | **PARTLY**            | **PARTLY**            | SOURCE: `public-docs/orchestration.md` and the MCP tools launch children, with profiles for presets. GUESS: no "nested worker depth" setting in Paseo. The cap is a DCI house rule (tiers, FM share), not a Paseo field.                                                  |
| 5   | Dispatched brief with scope and exit rules        | **LACKS** (by design) | **LACKS** (by design) | Paseo carries whatever prompt you send. The brief shape is a DCI habit (`noheli`), not a product feature.                                                                                                                                                                 |
| 6   | Usage clocks, reset actions, account switching    | **PARTLY**            | **PARTLY**            | SOURCE: see detail E.                                                                                                                                                                                                                                                     |
| 7   | Phone view: PR badges, awaiting-permission row    | **PARTLY**            | **PARTLY**            | SOURCE: Paseo mobile exists, with attention states and push. GUESS: a per-row PR number on the phone list. Paseo has a pull-request panel (`git/pull-request-panel/`), but I did not trace it to the mobile row.                                                          |
| 8   | Automations with templates                        | **PARTLY**            | **PARTLY**            | SOURCE: `public-docs/schedules.md` (cron and interval, "keep run workspaces"). GUESS: Orca's value is the templates; Paseo has no template gallery that I found.                                                                                                          |
| 9   | Remote worktrees over SSH, "Run on" picker        | **PARTLY**            | **HAS**               | SOURCE: see answer 4.                                                                                                                                                                                                                                                     |
| 10  | Computer Use (agents operate desktop apps)        | **LACKS**             | **LACKS**             | GUESS: nothing in the app tree. Paseo's agent browser tools drive Paseo's own browser tabs only (`public-docs/browser-tools.md`).                                                                                                                                         |
| 11  | Mobile emulator preview                           | **LACKS**             | **LACKS**             | GUESS: nothing found. The browser pane has device-size presets (`DeviceSizeId` in `index.electron.tsx`), which is a different thing.                                                                                                                                      |

### Detail A: element annotation (row 1)

- **The picker.** `desktop/browser/pane/element-selector.electron.ts` has two modes, `"annotate"` and `"screenshot"`. It runs a script in the webview and returns a selection. SOURCE.
- **What reaches the agent.** `desktop/browser/pane/index.electron.tsx:219-290` builds a `<browser-element url=…>` block. It holds: React source (`component @ file:line:col`), CSS selector, text (200 chars), size, five computed styles, the top three parents, HTML (800 chars) and `feedback:` (the user's note). The attachment object also carries the full computed styles, bounding rect, parent chain, children and an optional cropped screenshot (`attachments/types.ts:25-47`). SOURCE.
- **The React source is something Orca's video never showed.** Paseo sends the component's file and line.
- **Numbered badges** draw over annotated elements in the page (`buildAnnotationMarkerScript`, lines 322-400). SOURCE.
- **Batching.** Each annotation is appended to the workspace composer's attachment list (`addElementAttachment`, lines 1060-1082). Several notes ride along with the next prompt you send. SOURCE. The difference from Orca: Paseo does not send on its own. The notes wait in the composer, and you press send.
- **No Change or Question tag.** `BrowserElementAnnotation` is `{ comment: string }` (line 98). SOURCE. Orca's tag is a real difference.
- **Desktop only.** The file ends in `.electron.tsx`, so it needs the Electron `<webview>`. Plain web and the phone have no picker. SOURCE (by the file-extension convention in `CLAUDE.md`).
- **Prior art for Des.** Agents can also drive the same browser through the `browser_*` MCP tools (`public-docs/browser-tools.md`: snapshot, click, fill, screenshot and more). Off by default. SOURCE.

### Detail B: diff-line comments (row 2)

- **Where.** The review surface lives in `review/surface.tsx`, with a comment sheet (`review/comment-sheet.tsx`) titled by file, side and line (`−12` or `+12`). SOURCE.
- **Drafts.** `review/store.ts` keeps drafts per scope and builds a snapshot: comments plus context lines around each target line (`buildReviewAttachmentSnapshot`, line 204). SOURCE.
- **Delivery.** The snapshot becomes a composer attachment of kind `"review"` with a comment count (`attachments/types.ts:130-135`). It goes to the agent with the next prompt. `clearSentReviewDraftComments` (`store.ts:325`) clears the drafts after the send. SOURCE.
- **So batching is real**, and the agent sees file, side, line, context and your words. GUESS: how it renders in the agent's prompt; I did not read the server side.

## 2. The gap Des cares about most

**Marking up a passage of an agent's chat reply and sending the comment back (c).** This is the one with no counterpart.

What Paseo has near it (all SOURCE):

- `assistant-selection-copy/` (`surface.web.tsx`, `content.web.ts`) intercepts the browser copy event on assistant text and writes clean plain text and HTML to the clipboard. It does not attach, quote or comment.
- `ChatHistoryContextAttachment` (`attachments/types.ts:81`) carries chat history into a **forked** agent (`hooks/use-fork-agent.ts`, `screens/new-workspace-fork-context.ts`). That is whole-history context, not a passage with a note.
- Plugin file panels (0.13) can select inside a file. They do not touch chat.

### Precise comment to send to an agent, per item

**(a) Element annotation.** Paseo HAS it. The comment goes into `<browser-element>` as `feedback:` and rides the next prompt. The wanted additions, if any, are small.

- Add a `kind: "change" | "question"` field to `BrowserElementAnnotation` and print it in `formatElementAttachment`. Core change, about one file.
- Print the full parent chain, not three. Core change, one line.
- A plugin cannot do either. The picker is core UI, and the plugin SDK has no hook into the browser pane. SOURCE (`docs/plugins.md` lists the surfaces: panels, slash commands, timeline items, header buttons, composer pills, themes, attachment sources, settings; no browser-pane hook).
- 0.13 SDK changes nothing here.

**(b) Diff-line notes.** Paseo HAS it. Same plugin answer: no. Review is core (`review/`). Nothing to add beyond an optional tag, as in (a).

**(c) Mark up a passage of a chat reply, send the comment back.** Core change, not a plugin.

- **Why a plugin cannot.** A plugin can render a timeline row (`addTimelineRenderer`, transformers) and add composer pills and attachment sources. A transformer sees the message text and draws its own view. SOURCE (`public-docs/plugins/reference.md`, "Timeline items"). But it cannot read the user's text selection inside Paseo's own assistant row, and an attachment source is a picker backed by a daemon RPC, not "attach this selection". Plugin-drawn text with `<Text selectable>` gives native long-press selection only (reference.md, "Copy and paste"). So a plugin could re-render the whole message itself and own selection there. That is a rebuild of the message view, not an add-on. GUESS on effort.
- **What the core change looks like.** Reuse the review pattern: a selection toolbar on assistant text (`assistant-selection-copy/surface.web.tsx` already catches the selection) that opens the same comment sheet and pushes a new composer attachment kind, say `"reply_note"`, carrying the quoted passage, message id and the note. The attachment and draft machinery in `attachments/types.ts` and `review/store.ts` is the template. GUESS on size: a small, contained change on web and Electron; native selection on the phone is harder.
- **0.13 SDK:** `useTabState`, file panels and the `Markdown` export do not help. `Markdown` draws text with the host's selection, but gives the plugin no callback for the selection (reference.md, "Markdown": "the host supplies theme, text selection"). GUESS that adding an `onSelection` callback there would be a second route, but it would only serve text a plugin draws.

**(d) Fire a new sub-agent with a comment on a section of a page.** A plugin can do the launching half. The pointing half is the same gap as (c).

- **Launching.** A server handler or lifecycle hook can create a workspace and an agent: `paseo.workspaces.create(...)` then `workspace.agents.create(...)` (`public-docs/plugins/reference.md` around line 2385-2394), and `agents.ref(id)` for follow-ups and permission answers (lines 753, 792). SOURCE. Hosts are reachable too (`context.paseo.hosts`).
- **Pointing at a section.** A plugin file panel (0.13) mounts Markdown, HTML, PDF or its own view and has file selection support (reference.md, file panels). The panel could capture a selected range and call its own RPC to launch the child with the quote plus the note. GUESS: this works for **files**, since the panel owns the view. It does not work for **chat text**, for the reason in (c).
- **0.13 SDK:** it does change this. `addAgentPanel` (an agent-scoped panel with `agentId` in params), `useTabState` (persisted per-tab state, for a draft comment list) and file panels together make a plugin "page reviewer" plausible: view the page, select a section, write a note, fire a child. SOURCE for the pieces; GUESS that they compose without a core change. Nobody has built it.

## 3. Paseo features that exist and look unused

My view of what Des uses is GUESS. What exists is SOURCE.

- **Browser pane with element picker and review comments.** The feedback tools above. Both are in 0.12 and 0.13.
- **Agent browser tools** (`browser_*`, `public-docs/browser-tools.md`). Off by default. They let an agent look at a running page and click it. This is Orca's "agent and you look at the same page", already present.
- **Plugin panels and the SDK** (`docs/plugins.md`): workspace panels, agent panels, file panels, sidebar items, header buttons, composer pills, timeline items, attachment sources, settings screens. PP and PSR use some of these. 0.13 adds `addAgentPanel`, `useTabState`, file panels and the `Markdown` export. SOURCE.
- **Lifecycle hooks** (reference.md, events table): `agent.turn_ended`, `agent.permission_requested` and more, with examples "Send a follow-up when a turn ends" and "Answer a permission request". A plugin can drive agents without a human. SOURCE.
- **Schedules** (`public-docs/schedules.md`), **workspace scripts and services** (`paseo.json`, `public-docs/worktrees.md`, MCP tools `list_workspace_scripts`, `start_workspace_script`).
- **Profiles** (`public-docs/agent-profiles.md`) for presets.
- **Connected hosts** (0.13): one daemon driving agents on another. Detail in `des/research/paseo-0.13-compat-and-korolev-20261024.md`.
- **Mobile app and push** (`server/src/server/push/`).
- **0.13 additions:** "All changes" as the default Changes view; "Implement with Auto" for Claude plan approvals (both from the 0.13 changelog notes, NOTES-level in my earlier report, not read in code).

## 4. Remote story

Orca (from Joey's pack): "Run on" in the create-worktree dialog, showing "Local Mac" (frame 1:44, SEEN). The vendor says remote worktrees over SSH (UNVERIFIED). The phone home lists desktops, "MacBook Pro Connected · 40 worktrees · 5 active" and "M1 Mini · home Disconnected" (frame 5:53, SEEN). A "Pair Desktop" action appears in the pack's list.

Paseo:

- **Host picker at creation.** `screens/new-workspace-screen.tsx:687` (`hostPickerOpen`). SOURCE. Same job as "Run on" for hosts the app knows.
- **0.13 connected hosts.** A daemon saves connections to other daemons (TCP, ws, wss, SSH, relay). Seven MCP tools take a `serverId`. All links act as the single owner with every permission. Agents can launch, list, message and wait on another host's agents, but not cancel, archive or kill them. SOURCE (my earlier report, from the code).
- **Phone.** The Paseo app connects to a daemon directly or through the E2E relay (`packages/relay`, `SECURITY.md`). It lists hosts and their agents. SOURCE for existence. GUESS: whether it shows per-host counts like "40 worktrees · 5 active".
- **Verdict.** Same job, different shape. Orca pairs a phone to a desktop app. Paseo pairs an app to a daemon, and a daemon to a daemon. Paseo has the more general mechanism and the weaker scoping (no per-link permissions). The "no scoped grants" point is the Korolev problem, not an Orca one.

## 5. Notifications and status

Paseo has more than the README assumed (SOURCE):

- **Attention states.** `attentionReason` is `"permission"`, `"error"` or `"finished"`. The status dot and tone logic treat a pending permission count above zero like `"permission"` (`components/agent-status-dot.tsx`, `types/agent-directory.ts`). So an awaiting-permission row exists.
- **Mark unread.** `workspace/mark-unread.ts` marks a workspace unread through the daemon.
- **Push.** `server/src/server/push/` holds the push service and token store; `agent-attention-policy.ts` decides when to notify.
- **Pending permissions from the agent side.** MCP `list_pending_permissions`.
- **Usage display.** `usage/` has window bars, meters, balance bars, a sidebar item, a modal and a host usage section. Reset times render (`formatResetLabel`, `usage/format.ts:93`).

Orca has, and Paseo does not (GUESS from searches that found nothing):

- **A reset action.** Orca's popover says "3 rate-limit resets available, Next expires in 10h 40m" with a "Reset now" button (frame 2:18, SEEN). Paseo shows the clock only. I found no reset call.
- **Account hot-swap.** The vendor says "hot-swap accounts without re-logging in" and the popover has "Manage Accounts…" (SEEN: the menu item; UNVERIFIED: that it hot-swaps). My search for account-switching code found only Claude config-directory handling on the server (`providers/claude/project-dir.ts`, agent hooks), not a switcher.
- **Keep awake.** Orca has On, Agent or Off (frame 6:43 per the README). I found no sleep blocker in the desktop or server source.

## 6. Ranking: what is worth Des's attention

1. **Chat-reply markup (answer 2c).** The only feature Des asked for that Paseo cannot do. It is the one place where Orca's _idea_ (point at a thing, send a precise note) has no Paseo version at all. Orca does not have it either, as far as the video shows. It would be new ground for both. The review-comment machinery is the template, so the cost is bounded. Needs a core change, so a fork overlay, not a plugin. By Des's own rule that "anything Des sees goes in a plugin", this is the exception to raise, because the SDK has no selection hook.
2. **Usage reset action and account switch.** Cheap to look at, and it matters if Des's fleet runs several accounts or hits limits. The reset action depends on the provider exposing it (GUESS). The switcher is a different problem and may belong to the DCI usage backend, not Paseo. Vendor claims here are UNVERIFIED.
3. **A Change or Question tag, plus a visible count of waiting notes.** Paseo already batches; the tag is one field. It makes the notes read better to an agent. Low value on its own.

Not on the list, and why: worktree-per-agent, remote hosts, notifications and the phone view are already covered. Orchestration briefs and depth caps are DCI's lane (Joey asked the DCI Head Guy for that lens).

## Unverified and not read

- The Orca source, its docs pages, and how "Notes sent to active agent" is built.
- How a review attachment renders in an agent's prompt (server side).
- Whether the Paseo phone list shows PR numbers.
- Whether anyone has built a plugin on the 0.13 panel pieces for page review.
- The "Implement with Auto" and "All changes" items: changelog level only.
