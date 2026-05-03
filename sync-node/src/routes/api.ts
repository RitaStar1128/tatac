import { createHash } from "node:crypto";

import { Router } from "express";

import {
  apiErrorSchema,
  bootstrapResponseSchema,
  consumePairingSessionRequestSchema,
  consumePairingSessionResponseSchema,
  createPairingSessionRequestSchema,
  createPairingSessionResponseSchema,
  healthResponseSchema,
  pullRequestSchema,
  pullResponseSchema,
  pushRequestSchema,
  pushResponseSchema,
  registerDeviceRequestSchema,
  registerDeviceResponseSchema,
  type SyncNodeCandidate,
} from "../../../shared/contracts";
import { decodeBase64Url, encodeBase64Url } from "../../../shared/lib/base64url";

import {
  FileBackedSyncNodeStore,
  PairingSessionStoreError,
} from "../services/fileStore";

function validationError(message: string) {
  return apiErrorSchema.parse({
    ok: false,
    error: {
      code: "VALIDATION_ERROR",
      message,
    },
  });
}

function internalError() {
  return apiErrorSchema.parse({
    ok: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "Unexpected sync node error",
    },
  });
}

function hashPairingKey(pairingKey: string): string {
  return encodeBase64Url(createHash("sha256").update(decodeBase64Url(pairingKey)).digest());
}

function mapPairingError(error: PairingSessionStoreError): {
  status: number;
  payload: ReturnType<typeof apiErrorSchema.parse>;
} {
  const status =
    error.code === "PAIRING_NOT_FOUND"
      ? 404
      : error.code === "PAIRING_ALREADY_USED" || error.code === "PAIRING_EXPIRED"
        ? 409
        : 400;

  return {
    status,
    payload: apiErrorSchema.parse({
      ok: false,
      error: {
        code: error.code,
        message: error.message,
      },
    }),
  };
}

export interface BootstrapInfo {
  candidateUrls: string[];
  candidates: SyncNodeCandidate[];
  defaultCandidateUrl: string;
}

export function createApiRouter(
  store: FileBackedSyncNodeStore,
  options: { getBootstrapInfo: () => BootstrapInfo },
): Router {
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

  router.get("/bootstrap", async (_request, response) => {
    const result = await store.health();
    const bootstrap = options.getBootstrapInfo();

    response.json(
      bootstrapResponseSchema.parse({
        ok: true,
        nodeId: result.nodeId,
        serverTime: result.serverTime,
        candidateUrls: bootstrap.candidateUrls,
        candidates: bootstrap.candidates,
        defaultCandidateUrl: bootstrap.defaultCandidateUrl,
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
      const result = await store.push(body.userId, body.keyEpoch, body.deviceId, body.envelopes);
      response.json(
        pushResponseSchema.parse({
          ok: true,
          accepted: result.accepted,
          acceptedContentHashes: result.acceptedContentHashes,
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
      const result = await store.pull(body.userId, body.keyEpoch, body.deviceId, body.afterSeq, body.limit);
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

  router.post("/pairing-sessions", async (request, response) => {
    try {
      const body = createPairingSessionRequestSchema.parse(request.body);
      const result = await store.createPairingSession(body);
      response.json(
        createPairingSessionResponseSchema.parse({
          ok: true,
          sessionId: result.sessionId,
          expiresAt: result.expiresAt,
        }),
      );
    } catch (error) {
      response.status(400).json(validationError(error instanceof Error ? error.message : "Invalid request body"));
    }
  });

  router.post("/consume-pairing-session", async (request, response) => {
    try {
      const body = consumePairingSessionRequestSchema.parse(request.body);
      const result = await store.consumePairingSession({
        sessionId: body.sessionId,
        pairingKeyHash: hashPairingKey(body.pairingKey),
      });

      response.json(
        consumePairingSessionResponseSchema.parse({
          ok: true,
          nodeId: result.nodeId,
          serverTime: result.serverTime,
          bundle: result.bundle,
        }),
      );
    } catch (error) {
      if (error instanceof PairingSessionStoreError) {
        const mapped = mapPairingError(error);
        response.status(mapped.status).json(mapped.payload);
        return;
      }

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
