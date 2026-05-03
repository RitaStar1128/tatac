import express from "express";
import os from "node:os";
import path from "node:path";

import type { SyncNodeCandidate } from "../../shared/contracts";
import { createApiRouter, type BootstrapInfo } from "./routes/api";
import { FileBackedSyncNodeStore } from "./services/fileStore";

function createNodeId(): string {
  return `node_${os.hostname().replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase()}`;
}

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost";
}

function isWildcardHost(host: string): boolean {
  return host === "0.0.0.0" || host === "::";
}

function buildBootstrapCandidates(host: string, port: number): SyncNodeCandidate[] {
  if (isLoopbackHost(host)) {
    return [
      {
        url: `http://127.0.0.1:${port}`,
        label: "This PC only (127.0.0.1)",
        kind: "loopback",
        address: "127.0.0.1",
      },
    ];
  }

  if (!isWildcardHost(host)) {
    return [
      {
        url: `http://${host}:${port}`,
        label: `Configured host (${host})`,
        kind: "explicit",
        address: host,
      },
    ];
  }

  const candidates = new Map<string, SyncNodeCandidate>();
  const interfaces = os.networkInterfaces();

  for (const [interfaceName, addresses] of Object.entries(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family !== "IPv4" || address.internal) {
        continue;
      }
      const url = `http://${address.address}:${port}`;
      if (!candidates.has(url)) {
        candidates.set(url, {
          url,
          label: `${interfaceName} (${address.address})`,
          kind: "lan",
          address: address.address,
          interfaceName,
        });
      }
    }
  }

  if (candidates.size === 0) {
    candidates.set(`http://127.0.0.1:${port}`, {
      url: `http://127.0.0.1:${port}`,
      label: "Fallback loopback (127.0.0.1)",
      kind: "loopback",
      address: "127.0.0.1",
    });
  }

  return Array.from(candidates.values()).sort((left, right) => left.label.localeCompare(right.label));
}

function getBootstrapInfo(host: string, port: number): BootstrapInfo {
  const candidates = buildBootstrapCandidates(host, port);
  return {
    candidates,
    candidateUrls: candidates.map((candidate) => candidate.url),
    defaultCandidateUrl: candidates[0].url,
  };
}

const app = express();
const port = Number(process.env.SYNC_NODE_PORT ?? "4010");
const host = process.env.SYNC_NODE_HOST ?? "0.0.0.0";
const dataFile = process.env.SYNC_NODE_DATA_FILE ?? path.resolve(process.cwd(), "sync-node", "data", "node-store.json");

const store = new FileBackedSyncNodeStore({
  filePath: dataFile,
  nodeId: process.env.SYNC_NODE_ID ?? createNodeId(),
});

app.use((request, response, next) => {
  response.header("Access-Control-Allow-Origin", "*");
  response.header("Access-Control-Allow-Headers", "Content-Type");
  response.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }
  next();
});

app.use(express.json({ limit: "5mb" }));
app.use(
  "/api/v1",
  createApiRouter(store, {
    getBootstrapInfo: () => getBootstrapInfo(host, port),
  }),
);

app.get("/", (_request, response) => {
  void store.health().then((health) => {
    const uptimeSecs = Math.floor(process.uptime());
    const hours = Math.floor(uptimeSecs / 3600);
    const minutes = Math.floor((uptimeSecs % 3600) / 60);
    const seconds = uptimeSecs % 60;
    const uptime = `${hours}h ${minutes}m ${seconds}s`;
    const bootstrap = getBootstrapInfo(host, port);

    const candidateList = bootstrap.candidateUrls
      .map((url) => `<li style="font-family:monospace">${url}</li>`)
      .join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>tatac sync-node</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:480px;margin:40px auto;padding:0 20px;color:#111}
  h1{font-size:1.1rem;font-weight:900;text-transform:uppercase;letter-spacing:.15em;margin:0 0 24px}
  .row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #e5e5e5;font-size:.875rem}
  .label{color:#666;font-size:.75rem;text-transform:uppercase;letter-spacing:.1em}
  a{color:#111;font-weight:700}
  ul{margin:8px 0 0;padding-left:20px;font-size:.875rem}
</style>
</head>
<body>
<h1>tatac sync-node &#9679; running</h1>
<div class="row"><span class="label">Node ID</span><span style="font-family:monospace">${health.nodeId}</span></div>
<div class="row"><span class="label">Uptime</span><span>${uptime}</span></div>
<div class="row"><span class="label">Data file</span><span style="font-family:monospace;font-size:.75rem">${dataFile}</span></div>
<div class="row" style="flex-direction:column;gap:4px">
  <span class="label">Addresses</span>
  <ul>${candidateList}</ul>
</div>
<div style="margin-top:24px">
  <a href="http://127.0.0.1:3000">Open tatac &rarr;</a>
</div>
</body>
</html>`;

    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.send(html);
  });
});

app.listen(port, host, () => {
  const bootstrap = getBootstrapInfo(host, port);
  console.log(`Sync node listening on http://${host}:${port}`);
  console.log(`Sync node data file: ${dataFile}`);
  console.log(`Sync node bootstrap candidates: ${bootstrap.candidateUrls.join(", ")}`);
});
