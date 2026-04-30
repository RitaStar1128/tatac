import { z } from "zod";

import {
  clientVersionSchema,
  deviceIdSchema,
  deviceNameSchema,
  encryptedEnvelopeSchema,
  isoDateTimeStringSchema,
  nodeIdSchema,
  nonNegativeIntSchema,
  userIdSchema,
} from "./domain";

export const registerDeviceRequestSchema = z
  .object({
    userId: userIdSchema,
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
    deviceId: deviceIdSchema,
    envelopes: z.array(encryptedEnvelopeSchema),
  })
  .strict();

export const pushResponseSchema = z
  .object({
    ok: z.literal(true),
    accepted: nonNegativeIntSchema,
    lastSeq: nonNegativeIntSchema,
  })
  .strict();

export const pullRequestSchema = z
  .object({
    userId: userIdSchema,
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
export type ApiError = z.infer<typeof apiErrorSchema>;
