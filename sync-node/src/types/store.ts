import { z } from "zod";

import { encryptedEnvelopeSchema } from "../../../shared/contracts";

export const storedEnvelopeItemSchema = z
  .object({
    seq: z.number().int().positive(),
    envelope: encryptedEnvelopeSchema,
  })
  .strict();

export const registeredDeviceSchema = z
  .object({
    deviceId: z.string().min(1),
    deviceName: z.string().min(1),
    clientVersion: z.string().min(1),
    registeredAt: z.string().min(1),
    lastSeenAt: z.string().min(1),
  })
  .strict();

export const userBucketSchema = z
  .object({
    nextSeq: z.number().int().nonnegative(),
    devices: z.record(z.string(), registeredDeviceSchema),
    items: z.array(storedEnvelopeItemSchema),
  })
  .strict();

export const syncNodeStoreSchema = z
  .object({
    nodeId: z.string().min(1),
    users: z.record(z.string(), userBucketSchema),
  })
  .strict();

export type StoredEnvelopeItem = z.infer<typeof storedEnvelopeItemSchema>;
export type RegisteredDevice = z.infer<typeof registeredDeviceSchema>;
export type UserBucket = z.infer<typeof userBucketSchema>;
export type SyncNodeStore = z.infer<typeof syncNodeStoreSchema>;
