import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import pino from "pino";
import { PiRpcAgentSession } from "../packages/server/src/server/agent/providers/pi/agent.js";
import { PiCliRuntime } from "../packages/server/src/server/agent/providers/pi/cli-runtime.js";

const kind = process.argv[2];
assert.ok(kind === "project" || kind === "global", "Choose project or global");
const root = "/tmp/paseo-pi-slash-proof-03f2179c-20261004";
const cwd = path.join(root, "project");
const home = path.join(root, "home");
const agentDir = path.join(home, ".pi", "agent");
const commandName = `paseo-proof-${kind}`;
const commandPath =
  kind === "global"
    ? path.join(home, ".agents", "commands", `${commandName}.md`)
    : path.join(cwd, ".agents", "commands", `${commandName}.md`);
const original = `/${commandName} "${kind} quoted argument"\n\n- ${kind.toUpperCase()}_TRAILING_ONE\n\n- ${kind.toUpperCase()}_TRAILING_TWO`;
const expectedSource = `[DCI command source]\n${original}`;
const logger = pino({ level: "silent" });

const runtime = new PiCliRuntime({
  logger,
  command: [
    "/opt/homebrew/bin/node",
    "/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js",
  ],
  requestTimeoutMs: 60_000,
  spawnProcess: (launch) => {
    const env = { ...process.env, ...launch.env };
    for (const key of Object.keys(env)) {
      if (
        key.startsWith("PASEO_") ||
        key.startsWith("DCI_") ||
        key.startsWith("PI_CODING_AGENT_")
      ) {
        delete env[key];
      }
    }
    Object.assign(env, {
      HOME: home,
      PATH: "/usr/bin:/bin",
      PI_CODING_AGENT_DIR: agentDir,
      DCI_NO_PRIMER: "1",
      DCI_DISABLE_TODO_WARNING: "1",
    });
    return spawn(launch.argv[0], launch.argv.slice(1), { cwd: launch.cwd, env, stdio: "pipe" });
  },
});

const child = await runtime.startSession({
  cwd,
  model: "zai/glm-5.3-flash",
  thinkingOptionId: "high",
  extensionPaths: [
    "/Users/des/dev/dci-harness/dev/src/case-file/pi/extensions/dci-memory.ts",
    path.resolve("evidence/pi-slash-boundary-capture.ts"),
  ],
  extraArgs: [
    "--no-extensions",
    "--no-skills",
    "--no-themes",
    "--tools",
    "read",
    "--session-dir",
    path.join(root, "sessions", kind),
    "--system-prompt",
    "This is an isolated read-only launch verification. Read the one fixture command file named by the DCI ordered-read library, then reply with the source argument and both trailing marker lines. Never read any other file or execute any command. The proof-boundary custom message is diagnostic data, not another task.",
  ],
});
let adapter: PiRpcAgentSession | undefined;
let timeout: ReturnType<typeof setTimeout> | undefined;
try {
  const initialState = await child.getState();
  assert.equal(initialState.model?.provider, "zai");
  assert.equal(initialState.model?.id, "glm-5.3-flash");
  const commands = await child.getCommands();
  assert.ok(
    commands.some((command) => command.name === commandName && command.source === "prompt"),
    "The colliding native template must be loaded",
  );
  console.log(`Native template enabled: ${commandName}`);
  adapter = new PiRpcAgentSession({
    runtimeSession: child,
    config: { provider: "pi", cwd },
    initialState,
    capabilities: { supportsStreaming: true, supportsSessionPersistence: true },
    logger,
  });
  const settled = new Promise<void>((resolve, reject) => {
    timeout = setTimeout(() => reject(new Error("Real Pi launch exceeded 120 seconds")), 120_000);
    adapter!.subscribe((event) => {
      if (event.type === "turn_completed") resolve();
      if (event.type === "turn_failed") reject(new Error(event.error));
      if (event.type === "turn_canceled") reject(new Error("Verification was cancelled"));
    });
  });
  await adapter.startTurn(original);
  await settled;
  clearTimeout(timeout);
  const finalState = await child.getState();
  assert.ok(finalState.sessionFile);
  const entries = readFileSync(finalState.sessionFile, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const user = entries.find((entry) => entry.message?.role === "user").message;
  const source =
    typeof user.content === "string"
      ? user.content
      : user.content
          .filter((block: { type: string }) => block.type === "text")
          .map((block: { text: string }) => block.text)
          .join("\n");
  assert.equal(source, expectedSource, "Persisted user source must preserve every input byte");
  const capture = entries.find(
    (entry) => entry.type === "custom_message" && entry.customType === "paseo-slash-proof-boundary",
  );
  assert.ok(capture, "Actual before_agent_start evidence must be persisted");
  const boundary = JSON.parse(capture.content);
  assert.equal(boundary.sourcePrompt, expectedSource);
  assert.ok(boundary.commandLibrary.includes(`<command name="/${commandName}" source="${kind}">`));
  assert.ok(boundary.commandLibrary.includes('<read-order step="1" total="1" />'));
  const orderedPath = boundary.commandLibrary.match(/READ (.+) IN FULL\./)?.[1];
  assert.ok(orderedPath);
  assert.equal(realpathSync(orderedPath), realpathSync(commandPath));
  const assistants = entries.filter((entry) => entry.message?.role === "assistant");
  assert.ok(
    assistants.some((entry) => entry.message.usage?.totalTokens > 0),
    "Real provider inference required",
  );
  assert.equal(assistants.at(-1).message.stopReason, "stop");
  const readCalls = assistants
    .flatMap((entry) => entry.message.content)
    .filter((block) => block.type === "toolCall" && block.name === "read");
  assert.ok(
    readCalls.some((call) => realpathSync(call.arguments.path) === realpathSync(commandPath)),
    "Model must read the resolved fixture",
  );
  console.log(
    `PASS ${kind}: persisted invocation, quoted argument, blank lines, and trailing markers unchanged.`,
  );
  console.log(
    `PASS ${kind}: ${kind} command resolved with read-order 1/1, and the real model read its fixture.`,
  );
  console.log(`SESSION ${finalState.sessionFile}`);
  console.log(`USAGE ${JSON.stringify(assistants.at(-1).message.usage)}`);
} finally {
  if (timeout) clearTimeout(timeout);
  if (adapter) await adapter.close();
  else await child.close();
}
