import express from "express";
import os from "node:os";
import path from "node:path";

import { createApiRouter } from "./routes/api";
import { FileBackedSyncNodeStore } from "./services/fileStore";

function createNodeId(): string {
  return `node_${os.hostname().replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase()}`;
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
app.use("/api/v1", createApiRouter(store));

app.listen(port, host, () => {
  console.log(`Sync node listening on http://${host}:${port}`);
  console.log(`Sync node data file: ${dataFile}`);
});
