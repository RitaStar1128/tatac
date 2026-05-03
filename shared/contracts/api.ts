import { z } from "zod";

import {
  base64StringSchema,
  clientVersionSchema,
  deviceIdSchema,
  deviceNameSchema,
  encryptedEnvelopeSchema,
  isoDateTimeStringSchema,
  keyEpochSchema,
  nodeIdSchema,
  nonNegativeIntSchema,
  pairingBundleSchema,
  pairingSessionIdSchema,
  syncNodeUrlSchema,
  userIdSchema,
} from "./domain";

export const syncNodeCandidateSchema = z
  .object({
    url: syncNodeUrlSchema,
    label: z.string().min(1),
    kind: z.enum(["loopback", "lan", "explicit"]),
    address: z.string().min(1),
    interfaceName: z.string().min(1).optional(),
  })
  .strict();

export const registerDeviceRequestSchema = z
  .object({
    userId: userIdSchema,
    keyEpoch: keyEpochSchema,
    deviceId: deviceIdSchema,
    deviceName: deviceNameSchema,
    clientVersion: clientVersionSchema,
  })
  .strict();

export const registerDeviceResponseSchema = z
  .object({
    ok: z.literal(true),
    nodeId: nodeIdSchema,
    registeredAt: isoDateTimeStringSchema,
  })
  .strict();

export const pushRequestSchema = z
  .object({
    userId: userIdSchema,
    keyEpoch: keyEpochSchema,
    deviceId: deviceIdSchema,
    envelopes: z.array(encryptedEnvelopeSchema),
  })
  .strict();

export const pushResponseSchema = z
  .object({
    ok: z.literal(true),
    accepted: nonNegativeIntSchema,
    acceptedContentHashes: z.array(base64StringSchema),
    lastSeq: nonNegativeIntSchema,
  })
  .strict();

export const pullRequestSchema = z
  .object({
    userId: userIdSchema,
    keyEpoch: keyEpochSchema,
    deviceId: deviceIdSchema,
    afterSeq: nonNegativeIntSchema,
    limit: z.number().int().positive().max(500),
  })
  .strict();

export const pullItemSchema = z
  .object({
    seq: nonNegativeIntSchema,
    envelope: encryptedEnvelopeSchema,
  })
  .strict();

export const pullResponseSchema = z
  .object({
    ok: z.literal(true),
    items: z.array(pullItemSchema),
    nextAfterSeq: nonNegativeIntSchema,
    hasMore: z.boolean(),
  })
  .strict();

export const healthResponseSchema = z
  .object({
    ok: z.literal(true),
    nodeId: nodeIdSchema,
    serverTime: isoDateTimeStringSchema,
  })
  .strict();

export const bootstrapResponseSchema = z
  .object({
    ok: z.literal(true),
    nodeId: nodeIdSchema,
    serverTime: isoDateTimeStringSchema,
    candidateUrls: z.array(syncNodeUrlSchema).min(1),
    candidates: z.array(syncNodeCandidateSchema).min(1),
    defaultCandidateUrl: syncNodeUrlSchema,
  })
  .strict();

export const createPairingSessionRequestSchema = z
  .object({
    pairingKeyHash: base64StringSchema,
    bundle: pairingBundleSchema,
  })
  .strict();

export const createPairingSessionResponseSchema = z
  .object({
    ok: z.literal(true),
    sessionId: pairingSessionIdSchema,
    expiresAt: isoDateTimeStringSchema,
  })
  .strict();

export const consumePairingSessionRequestSchema = z
  .object({
    sessionId: pairingSessionIdSchema,
    pairingKey: base64StringSchema,
  })
  .strict();

export const consumePairingSessionResponseSchema = z
  .object({
    ok: z.literal(true),
    nodeId: nodeIdSchema,
    serverTime: isoDateTimeStringSchema,
    bundle: pairingBundleSchema,
  })
  .strict();

export const apiErrorSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export type RegisterDeviceRequest = z.infer<typeof registerDeviceRequestSchema>;
export type RegisterDeviceResponse = z.infer<typeof registerDeviceResponseSchema>;
export type PushRequest = z.infer<typeof pushRequestSchema>;
export type PushResponse = z.infer<typeof pushResponseSchema>;
export type PullRequest = z.infer<typeof pullRequestSchema>;
export type PullItem = z.infer<typeof pullItemSchema>;
export type PullResponse = z.infer<typeof pullResponseSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type BootstrapResponse = z.infer<typeof bootstrapResponseSchema>;
export type SyncNodeCandidate = z.infer<typeof syncNodeCandidateSchema>;
export type CreatePairingSessionRequest = z.infer<typeof createPairingSessionRequestSchema>;
export type CreatePairingSessionResponse = z.infer<typeof createPairingSessionResponseSchema>;
export type ConsumePairingSessionRequest = z.infer<typeof consumePairingSessionRequestSchema>;
export type ConsumePairingSessionResponse = z.infer<typeof consumePairingSessionResponseSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
