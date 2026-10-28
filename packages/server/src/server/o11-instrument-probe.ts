// o11 instrument run: in-process daemon on the FM's preserved home, debug
// logging to /tmp/o113-instrument.log, three pi creates in the pi repo cwd.
// The rpc send/reply timeline (859f6a939) names any silent create gap.
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import pino from "pino";
import { createPaseoDaemon } from "./bootstrap.js";
import { DaemonClient } from "./test-utils/daemon-client.js";

const logger = pino({ level: "debug" }, pino.destination("/tmp/o113-instrument.log"));
const paseoHome = "/tmp/o11-fm-home";
const staticDir = await mkdtemp(path.join(os.tmpdir(), "paseo-static-o113-"));

const daemon = await createPaseoDaemon(
  {
    listen: "127.0.0.1:0",
    paseoHome,
    corsAllowedOrigins: [],
    hostnames: true,
    mcpEnabled: false,
    staticDir,
    mcpDebug: false,
    agentClients: {},
    agentStoragePath: path.join(paseoHome, "agents"),
    relayEnabled: false,
    relayEndpoint: "relay.paseo.sh:443",
    appBaseUrl: "https://app.paseo.sh",
  },
  logger,
);

await daemon.start();
const target = daemon.getListenTarget();
const port = target?.type === "tcp" ? target.port : null;
console.log("daemon port:", port);

const client = new DaemonClient({ url: `ws://127.0.0.1:${port}/ws`, appVersion: "0.1.70" });
await client.connect();
await client.fetchAgents({ subscribe: {} });

for (let i = 0; i < 3; i++) {
  const t0 = Date.now();
  try {
    const agent = await client.createAgent({
      provider: "pi",
      cwd: "/Users/des/dev/personal/src/pi",
      model: "dgx-spark/cybertiel-coder-35b-a3b",
    });
    console.log(`run ${i + 1}: created in ${Date.now() - t0}ms id=${agent.id}`);
  } catch (error) {
    console.log(`run ${i + 1}: FAILED after ${Date.now() - t0}ms: ${String(error).slice(0, 200)}`);
  }
}

await client.close();
await daemon.stop();
console.log("instrument run done");
