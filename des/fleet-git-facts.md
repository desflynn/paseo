# Paseo platform facts — worktrees, PRs, sidebar truth

Research for Joey's o7.1/o7.2 (Des's fleet-git decision), 2026-10-16.
Read-only pass; every claim carries a path or NOT CONFIRMED. Fork checkout `0.11.1-df` lineage.

## ASK 1 — Worktrees and PRs in Paseo today

### Does Paseo create/manage git worktrees? Yes.

- Workspace creation is a first-class operation with `local | worktree` isolation; agent creation only ever selects an existing workspace, and runtime ownership resolves from the workspace ID, never from `cwd` (docs/agent-lifecycle.md:72).
- CLI surface: `paseo run --new-worktree <local|worktree>`, `--worktree-mode branch-off|checkout-branch|checkout-pr`, `--worktree-slug`, `--new-branch`, `--base` (`paseo run --help`, verified live on this machine). Legacy alias `paseo worktree create/ls/archive` still exists (docs/architecture.md:166).
- Server side: `packages/server/src/server/paseo-worktree-service.ts` (creates worktrees under a `worktreesBaseRoot`, line 136), `packages/server/src/server/worktree/commands.ts`, and per-worktree metadata files `writePaseoWorktreeMetadata` (`packages/server/src/utils/worktree-metadata.ts`, imported in utils/worktree.ts).
- Where they live: the base root flows from daemon runtime config as `worktreesRoot` (packages/server/src/server/session.ts:881, packages/server/src/server/websocket-server.ts:704). The `~/.paseo/worktrees` path in your logs is consistent with that; the exact default-join line in bootstrap: NOT CONFIRMED on this pass.

### Lifecycle and cleanup

- `create_agent_request` can opt into `autoArchive`: the daemon archives the agent after the first terminal turn event, archives the isolated workspace it owns, and the managed worktree directory is removed when its final workspace reference is gone (docs/agent-lifecycle.md:94).
- Archive/removal machinery: `packages/server/src/server/workspace-archive-service.ts` (`archiveByScope`, `killTerminalsForWorkspace`), with a guard that only Paseo-owned worktree cwds get removed (`isPaseoOwnedWorktreeCwd`, packages/server/src/utils/worktree.ts, used in packages/server/src/server/auto-archive-on-merge/archive-if-safe.ts).
- Workspace archive and agent archive are deliberately separate lifecycles; history navigation must not infer one from the other (docs/agent-lifecycle.md:106-112).

### What changes for the agent inside a worktree

- The agent's cwd IS the worktree; the workspace record carries `kind: "worktree"` with its own projectId (record shape: packages/server/src/server/workspace-directory.test.ts fixtures; live examples in ~/.paseo/projects/workspaces.json).
- Fleet-side guidance (not core): passing a different cwd than the parent weakens the Paseo detail panel (paseo-bridge block in this repo's AGENTS.md, "cwd-parity rule"). Core-side behaviour differences for project trust / extension loading inside a worktree: NOT CONFIRMED on this pass.

### Is there a first-class PR concept?

- No PR entity on the workspace list, but PRs are a real product surface, not just `gh`:
  - The daemon maintains a git runtime snapshot per workspace: `currentBranch`, `isDirty`, `aheadBehind`, `aheadOfOrigin/behindOfOrigin`, and `forge.pullRequest` with mergeable state (`packages/server/src/server/workspace-git-service.ts:162-195`, `getPullRequestStatus`, types `PullRequestCheck`/`PullRequestMergeable`).
  - The app renders PRs: three-way open location (Main panel / On the side / Explorer sidebar) and automatic PR discovery per workspace (docs/explorer-sidebar.md:32-35, 91-92; `packages/app/src/workspace-tabs/open-supporting-view.ts`, `packages/app/src/git/`).
  - Forge abstraction covers GitHub and GitLab wording (docs/forge-providers.md; `getForgePresentation` context, docs/i18n.md:46).
  - Agent-side PR actions go through the daemon's forge service (`searchIssuesAndPrs`, `createPullRequest`, `mergePullRequest` — session wiring mirrored in packages/server/src/server/session.test.ts github mock).
- The fact that matters for Des's decision: **auto-archive on merge exists**. When a Paseo-owned worktree's PR merges, `archiveIfSafe` archives the workspace (kills its terminals, archives by scope) — `packages/server/src/server/auto-archive-on-merge/archive-if-safe.ts`; end-to-end proof in `packages/app/e2e/browser/auto-archive-after-merge.real.spec.ts`. So "issue in, PR out, worktree cleans itself up on merge" is mechanically supported today, per workspace, without touching main checkouts.

### Two agents in the same checkout simultaneously

- Git facts (branch/diff/dirty/PR) belong to the checkout and fan out to EVERY workspace whose cwd is that checkout — explicitly "git-fact display, NOT ownership" (`workspaceIdsOnCheckout`, packages/server/src/server/workspace-directory.ts:128-142).
- Workspace activity attribution between same-cwd siblings uses a deterministic-oldest fallback that can attribute a stamped agent's activity to the wrong sibling (comment at packages/server/src/server/workspace-directory.ts:42-45).
- File observation is one shared observer service with subscribed roots — no per-agent isolation (docs/file-observation.md:3).
- Known upstream watch-item: OpenCode sessions sharing one host process across agent sessions (getpaseo/paseo#4009, untested here). Other product-level breakage beyond attribution/watcher sharing: NOT CONFIRMED.

## ASK 2 — What the sidebar actually surfaces

### Workspace row: real vs derived

Row component: `packages/app/src/components/sidebar/sidebar-workspace-row-content.tsx`.

- REAL (from daemon records): agent statuses (running/idle/error/closed), `requiresAttention` + `attentionReason` on the agent record (fields verified live in this daemon's own list output), workspace registry fields — labels array, title, archivedAt.
- DERIVED: the row's status dot color comes from a status BUCKET (`getStatusDotColor`, bucket `needs_input` mapping at sidebar-workspace-row-content.tsx:34-36). Buckets are computed in the daemon's workspace directory and held in a per-process `bucketHistoryByWorkspaceId` map that "persists across buildDescriptorMap calls inside the daemon process; reset on cold start" (packages/server/src/server/workspace-directory.ts, comment on the WorkspaceDirectory class). Project status indicator and hostBadge render alongside.
- Labels: the workspace carries label NAMES; colors come from that host's catalog (sidebar-workspace-row-content.tsx:125-128). GUY/MINE/SUB/BRO/Wake_Me are names in one shared catalog (~/.paseo/projects/workspace-labels.json) — anyone (or any overlay) can set or clear them, and the row trusts them. MINE and SUB on this install are fork overlays (packages/server/src/server/session.ts `applyOwnerMineLabel`, `maybeApplySubLabel` — des/overlays), not upstream behaviour.

### Where git state shows up

- NOT in the workspace list rows: sidebar-workspace-row-content.tsx renders no branch/dirty/PR.
- Git state surfaces in the workspace detail surfaces: the git snapshot above feeds the Explorer sidebar's Changes and pull-request panels (docs/explorer-sidebar.md:25-55) and git-metadata events (packages/server/src/server/git-metadata-event-rules.ts). Branch/dirty/PR are per-workspace panel facts, invisible from the fleet list.

### What will silently lie to Des

1. **The status bucket is derived and in-memory.** It resets on daemon cold start and can lag or mis-bucket; it is not the agents' literal state (workspace-directory.ts bucket comment).
2. **Needs input paints only while a harness question tool waits.** A seat that asks Des in plain chat prose never paints it (ask/Needs-input protocol, dci-owner-ask skill; core fields requiresAttention/attentionReason only carry what the daemon knows). Conversely `attentionReason: "finished"` keeps flagging a finished agent until consumed (observed live in this daemon's agent list).
3. **Wake_Me is ledger-driven and can go stale.** A wake that dies without reconciliation leaves the chip lying (wake rules, dci-wake skill; chip reconciles only via wake status checks).
4. **Labels are convention.** The row renders whatever names are assigned; nothing validates that GUY means a guy or MINE means Des-origin beyond overlay code paths (sidebar-workspace-row-content.tsx:125-128; overlay paths in session.ts).
5. **Same-cwd siblings share git facts and can cross-attribute activity** (workspace-directory.ts:128-142 and the 42-45 comment) — two agents in one checkout will make the sidebar's activity story unreliable even before file conflicts.
6. **Dirty/branch/PR state never appears in the list** — Des cannot see from the sidebar that a seat committed straight to main; that state lives only inside each workspace's panels (sidebar row component has no git fields; git snapshot consumers are the Explorer/Changes/PR surfaces).
