import path from "node:path";

process.env.SYNC_NODE_PORT ??= "4110";
process.env.SYNC_NODE_HOST ??= "127.0.0.1";
process.env.SYNC_NODE_ID ??= "node_playwright";
process.env.SYNC_NODE_DATA_FILE ??= path.resolve(
  process.cwd(),
  "sync-node",
  "data",
  "playwright-node-store.json",
);

void import("../sync-node/src/index.ts");
