import express from "express";
import os from "node:os";
import path from "node:path";

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

function buildCandidateUrls(host: string, port: number): string[] {
  if (isLoopbackHost(host)) {
    return [`http://127.0.0.1:${port}`];
  }

  if (!isWildcardHost(host)) {
    return [`http://${host}:${port}`];
  }

  const candidates = new Set<string>();
  const interfaces = os.networkInterfaces();

  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family !== "IPv4" || address.internal) {
        continue;
      }
      candidates.add(`http://${address.address}:${port}`);
    }
  }

  if (candidates.size === 0) {
    candidates.add(`http://127.0.0.1:${port}`);
  }

  return Array.from(candidates);
}

function getBootstrapInfo(host: string, port: number): BootstrapInfo {
  const candidateUrls = buildCandidateUrls(host, port);
  return {
    candidateUrls,
    defaultCandidateUrl: candidateUrls[0],
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
