# FM-WORKLOG — daemon Claude effective auto-compact denominator

Seat: NARROWBODY (glm-5.3-flash), Pi, /Users/des/dev/paseo, branch 0.11.1-df.
Own files only: `packages/server/src/server/agent/providers/claude/agent.ts`, `agent.test.ts`, this log.
No commit, no restart, no app/config/other-file changes. Parent owns deployment/commit.

## Design (locked with Des, traps absorbed)

Precedence for the denominator: env `CLAUDE_CODE_AUTO_COMPACT_WINDOW` > `modelSettings[model id].autoCompactWindow` > top-level `autoCompactWindow` > model window; capped at model window. `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` ignored here (trigger-only, CLI-side).

Traps:

1. No override => SDK-reported window preserved exactly (even if it differs from manifest). Only a configured override is min'd with the model window.
2. modelSettings lookup uses real SDK `modelUsage` keys at record time (works when `config.model` unset/alias); ctor/setModel use `findClaudeModel(config.model)?.id ?? config.model`. Canonical id preferred, no alias-precedence chains.
3. Types: settings values accepted only as JSON numbers (finite > 0); numeric strings in settings rejected -> fall through. Env value parsed as numeric string (finite > 0). Invalid -> fallback to next source.

Real ids (manifest, all SDK-full 1M): claude-opus-5-5, claude-sonnet-5-5, claude-haiku-5-5.
Target denominators: Opus/Sonnet 550000, Haiku 112000 (user settings).

## Units

- U1 RED: Opus modelSettings 550000 + SDK modelUsage 1M => emitted denominator 550000. [pending]
- U2 RED: precedence table (env>modelSettings>top-level>model window; invalid fallbacks; pct ignored). [pending]
- U3 RED/GREEN: cap, Haiku 112000, stream denominators, model switch, no-override SDK preservation guard. [pending]
- U4: implementation in agent.ts (small resolver + sync settings read + recordModelUsage per-key override). [pending]
- U5: whole agent.test.ts GREEN --bail=1 + scoped format/lint + server typecheck. [pending]

## Evidence log

- Harness: `QueryFactoryForTurnsOptions.runtimeEnv` -> `runtimeSettings.env` (overlay wins over process.env, = env actually passed to SDK); fake query gained `applyFlagSettings` (fast-mode-capable models like opus-5-5 hit `applyFlagSettings` in ensureQuery).
- U1 RED: `expected 1000000 to be 550000` (/tmp/u1-red2.log) — override ignored pre-impl.
- Full RED (/tmp/u2-red2.log): 9 failed (all override tests) | 90 passed (99). Guards green pre-impl by design: "capped at the SDK-reported model window" (both clamp to 1M) and "no override preserves SDK window" (321_000 passthrough). No existing test broken.
- U4 implemented in agent.ts: `readPositiveWindowTokens` / `parseEnvWindowTokens` / `readClaudeSettingsRecord` (sync, silent, never logs settings) / `resolveAutoCompactWindowOverride(env, settings, modelId)`; `extractContextWindowSize` now per-key with `override ? min(override, sdkWindow) : sdkWindow` then existing max; `recordModelUsage` + `buildResultUsage` take optional resolver; session `resolveUsageModelAutoCompactOverride` (canonicalises key via `findClaudeModel(key)?.id ?? key`), `resolveConfiguredAutoCompactWindowOverride` (env from `harnessEnvironment` = SDK env, settings via `claudeConfigDir(harnessEnvironment)`), `resolveInitialContextWindowMaxTokens` for ctor + `setModel`.
- GREEN (/tmp/u5-green2.log, re-confirmed /tmp/u5-final.log after format): 99 passed (99), 755ms. Test-side fixes during GREEN: U1 used tokens 150 (no delta in turn); Haiku + model-switch turn 2 needed a completing result message (turns without result hang run()), with on-model modelUsage keys to avoid the foreign-key max drag.
- Gates: oxfmt clean on both files; oxlint 0 warnings 0 errors; `npm run typecheck --workspace packages/server` exit 0.
- Diff footprint: only agent.ts + agent.test.ts modified (git status confirmed); worklog is untracked in des/.

## Status

DONE — all units complete. Awaiting parent (0ba29851) independent verification. Lane owner: Zoe 35f820f9-5669-4662-b568-64984e23121d. No commit, no deployment, no restart (restart choice open with Des via Zoe).
