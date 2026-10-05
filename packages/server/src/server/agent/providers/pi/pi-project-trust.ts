import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";

import { resolvePaseoHome } from "../../../paseo-home.js";

const execFileAsync = promisify(execFile);

/** Shape of Pi's ~/.pi/agent/trust.json: canonical directory path -> saved decision. */
export type PiTrustData = Record<string, boolean | null>;

/**
 * Mirror of Pi's trust-manager normalizeCwd (pi dist/core/trust-manager.js):
 * the canonical real path, or the resolved path when the entry does not exist.
 */
function canonicalDir(dir: string): string {
  try {
    return realpathSync(dir);
  } catch {
    return resolve(dir);
  }
}

/**
 * Pi's findNearestTrustEntry: walk from the directory upward and return the
 * nearest saved decision. `null` entries are skipped like absent ones.
 */
function findNearestPiTrustDecision(trust: PiTrustData, dir: string): boolean | null {
  let current = canonicalDir(dir);
  for (;;) {
    const value = trust[current];
    if (value === true || value === false) {
      return value;
    }
    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export interface PiApproveDecisionInput {
  /** Agent cwd; the caller only passes a source path when this is a managed worktree. */
  cwd: string;
  /** Source checkout of that worktree, or null/undefined when cwd is not one. */
  sourceCheckoutPath: string | null | undefined;
  /** Parsed Pi trust store, or undefined when missing/unreadable. */
  trust: PiTrustData | undefined;
}

/**
 * True when Pi would load the worktree's project-local files by its own rules:
 * the source checkout's nearest saved trust decision is `true`. Never approves
 * a plain checkout (source path equals cwd) and never approves without trust
 * data. Read-only: callers must never write the trust store.
 */
export function shouldApprovePiProject(input: PiApproveDecisionInput): boolean {
  if (!input.trust || !input.sourceCheckoutPath) {
    return false;
  }
  if (input.sourceCheckoutPath === input.cwd) {
    return false;
  }
  return findNearestPiTrustDecision(input.trust, input.sourceCheckoutPath) === true;
}

/** Pi's default agent trust store location. */
export function defaultPiTrustPath(): string {
  return join(homedir(), ".pi", "agent", "trust.json");
}

/** Read-only read of Pi's trust store. Returns undefined when missing, unreadable, or malformed. */
export async function readPiTrustFile(
  path: string = defaultPiTrustPath(),
): Promise<PiTrustData | undefined> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return undefined;
    }
    const data: PiTrustData = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value === true || value === false || value === null) {
        data[key] = value;
      }
    }
    return data;
  } catch {
    return undefined;
  }
}

/**
 * Source checkout for a Paseo-managed worktree cwd, via
 * `git rev-parse --path-format=absolute --git-common-dir`. Returns null when
 * cwd is outside $PASEO_HOME/worktrees, is a main checkout, or git fails;
 * callers must treat null as "no approval".
 */
export async function resolveManagedWorktreeSource(cwd: string): Promise<string | null> {
  const canonicalCwd = canonicalDir(cwd);
  const worktreeRoot = canonicalDir(join(resolvePaseoHome(), "worktrees"));
  if (canonicalCwd === worktreeRoot || !canonicalCwd.startsWith(worktreeRoot + sep)) {
    return null;
  }
  try {
    const { stdout } = await execFileAsync("git", [
      "-C",
      canonicalCwd,
      "rev-parse",
      "--path-format=absolute",
      "--git-common-dir",
    ]);
    const commonDir = stdout.trim();
    if (!commonDir || commonDir === join(canonicalCwd, ".git")) {
      return null;
    }
    return dirname(commonDir);
  } catch {
    return null;
  }
}
