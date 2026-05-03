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
app.listen(port, host, () => {
  const bootstrap = getBootstrapInfo(host, port);
  console.log(`Sync node listening on http://${host}:${port}`);
  console.log(`Sync node data file: ${dataFile}`);
  console.log(`Sync node bootstrap candidates: ${bootstrap.candidateUrls.join(", ")}`);
});
