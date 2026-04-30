import { Router } from "express";

import {
  healthResponseSchema,
  pullRequestSchema,
  pullResponseSchema,
  pushRequestSchema,
  pushResponseSchema,
  registerDeviceRequestSchema,
  registerDeviceResponseSchema,
} from "../../../shared/contracts";

import { FileBackedSyncNodeStore } from "../services/fileStore";

function validationError(message: string) {
  return {
    ok: false as const,
    error: {
      code: "VALIDATION_ERROR",
      message,
    },
  };
}

function internalError() {
  return {
    ok: false as const,
    error: {
      code: "INTERNAL_ERROR",
      message: "Unexpected sync node error",
    },
  };
}

export function createApiRouter(store: FileBackedSyncNodeStore): Router {
  const router = Router();

  router.get("/health", async (_request, response) => {
    const result = await store.health();
    response.json(
      healthResponseSchema.parse({
        ok: true,
        nodeId: result.nodeId,
        serverTime: result.serverTime,
      }),
    );
  });

  router.post("/register-device", async (request, response) => {
    try {
      const body = registerDeviceRequestSchema.parse(request.body);
      const result = await store.registerDevice(body);
      response.json(
        registerDeviceResponseSchema.parse({
          ok: true,
          nodeId: result.nodeId,
          registeredAt: result.registeredAt,
        }),
      );
    } catch (error) {
      response.status(400).json(validationError(error instanceof Error ? error.message : "Invalid request body"));
    }
  });

  router.post("/push", async (request, response) => {
    try {
      const body = pushRequestSchema.parse(request.body);
      const result = await store.push(body.userId, body.envelopes);
      response.json(
        pushResponseSchema.parse({
          ok: true,
          accepted: result.accepted,
          lastSeq: result.lastSeq,
        }),
      );
    } catch (error) {
      response.status(400).json(validationError(error instanceof Error ? error.message : "Invalid request body"));
    }
  });

  router.post("/pull", async (request, response) => {
    try {
      const body = pullRequestSchema.parse(request.body);
      const result = await store.pull(body.userId, body.afterSeq, body.limit);
      response.json(
        pullResponseSchema.parse({
          ok: true,
          items: result.items,
          nextAfterSeq: result.nextAfterSeq,
          hasMore: result.hasMore,
        }),
      );
    } catch (error) {
      response.status(400).json(validationError(error instanceof Error ? error.message : "Invalid request body"));
    }
  });

  router.use((_request, response) => {
    response.status(404).json({
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "Route not found",
      },
    });
  });

  router.use((error: unknown, _request: unknown, response: { status: (code: number) => { json: (payload: unknown) => void } }) => {
    console.error(error);
    response.status(500).json(internalError());
  });

  return router;
}
