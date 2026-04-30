import { z } from "zod";

const isParsableDateTime = (value: string): boolean => !Number.isNaN(Date.parse(value));

export const isoDateTimeStringSchema = z
  .string()
  .trim()
  .min(1)
  .refine(isParsableDateTime, "Expected ISO-8601 datetime string");

export const opaqueIdSchema = z.string().trim().min(1).max(128);

export const base64StringSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[A-Za-z0-9+/_-]+={0,2}$/, "Expected base64-encoded string");

export const nonNegativeIntSchema = z.number().int().nonnegative();

export const noteIdSchema = opaqueIdSchema;
export const opIdSchema = opaqueIdSchema;
export const userIdSchema = opaqueIdSchema;
export const deviceIdSchema = opaqueIdSchema;
export const deviceNameSchema = z.string().trim().min(1).max(128);
export const nodeIdSchema = opaqueIdSchema;
export const clientVersionSchema = z.string().trim().min(1).max(32);
export const syncNodeUrlSchema = z.url().trim();

export const noteRecordSchema = z
  .object({
    id: noteIdSchema,
    title: z.string(),
    body: z.string(),
    createdAt: isoDateTimeStringSchema,
    updatedAt: isoDateTimeStringSchema,
    deletedAt: isoDateTimeStringSchema.nullable(),
    version: nonNegativeIntSchema,
    lastOpId: opIdSchema,
  })
  .strict();

export const noteCreatePayloadSchema = z
  .object({
    type: z.literal("note.create"),
    title: z.string(),
    body: z.string(),
    createdAt: isoDateTimeStringSchema,
    updatedAt: isoDateTimeStringSchema,
  })
  .strict();

export const noteUpdatePayloadSchema = z
  .object({
    type: z.literal("note.update"),
    title: z.string().optional(),
    body: z.string().optional(),
    updatedAt: isoDateTimeStringSchema,
  })
  .strict()
  .refine((value) => value.title !== undefined || value.body !== undefined, {
    message: "note.update payload must include at least one changed field",
  });

export const noteDeletePayloadSchema = z
  .object({
    type: z.literal("note.delete"),
    deletedAt: isoDateTimeStringSchema,
  })
  .strict();

export const noteOpPayloadSchema = z.discriminatedUnion("type", [
  noteCreatePayloadSchema,
  noteUpdatePayloadSchema,
  noteDeletePayloadSchema,
]);

export const noteOpSchema = z
  .object({
    opId: opIdSchema,
    deviceId: deviceIdSchema,
    userId: userIdSchema,
    noteId: noteIdSchema,
    baseVersion: nonNegativeIntSchema,
    logicalTime: nonNegativeIntSchema,
    wallClock: isoDateTimeStringSchema,
    payload: noteOpPayloadSchema,
  })
  .strict();

export const encryptedEnvelopeSchema = z
  .object({
    envelopeVersion: z.literal(1),
    senderDeviceId: deviceIdSchema,
    recipientUserId: userIdSchema,
    nonce: base64StringSchema,
    cipherText: base64StringSchema,
    aad: base64StringSchema,
    createdAt: isoDateTimeStringSchema,
  })
  .strict();

export const envelopeAadSchema = z
  .object({
    envelopeVersion: z.literal(1),
    senderDeviceId: deviceIdSchema,
    recipientUserId: userIdSchema,
    createdAt: isoDateTimeStringSchema,
  })
  .strict();

export const syncKdfParamsSchema = z
  .object({
    algorithm: z.literal("PBKDF2"),
    hash: z.literal("SHA-256"),
    iterations: z.number().int().positive(),
    keyLengthBits: z.literal(256),
  })
  .strict();

// TODO: Revisit Argon2id via WASM if MVP portability constraints are relaxed.
export const DEFAULT_SYNC_KDF_PARAMS = {
  algorithm: "PBKDF2",
  hash: "SHA-256",
  iterations: 310_000,
  keyLengthBits: 256,
} as const satisfies z.infer<typeof syncKdfParamsSchema>;

export const persistedSyncConfigSchema = z
  .object({
    id: z.literal("active"),
    userId: userIdSchema,
    deviceId: deviceIdSchema,
    deviceName: deviceNameSchema,
    syncNodeUrl: syncNodeUrlSchema.nullable(),
    salt: base64StringSchema,
    kdf: syncKdfParamsSchema,
    createdAt: isoDateTimeStringSchema,
    updatedAt: isoDateTimeStringSchema,
    nodeId: nodeIdSchema.optional(),
    registeredAt: isoDateTimeStringSchema.optional(),
    lastSuccessfulSyncAt: isoDateTimeStringSchema.nullable().optional(),
  })
  .strict();

export const syncSessionSecretSchema = z
  .object({
    passphrase: z.string().min(8),
  })
  .strict();

export const syncCursorRecordSchema = z
  .object({
    id: z.string().min(1),
    userId: userIdSchema,
    syncNodeUrl: syncNodeUrlSchema,
    lastPulledSeq: nonNegativeIntSchema,
    updatedAt: isoDateTimeStringSchema,
  })
  .strict();

export const tatacSyncFileSchema = z
  .object({
    fileType: z.literal("tatacsync"),
    version: z.literal(1),
    exportedAt: isoDateTimeStringSchema,
    fromDeviceId: deviceIdSchema,
    userId: userIdSchema,
    salt: base64StringSchema,
    items: z.array(encryptedEnvelopeSchema),
  })
  .strict();

export type IsoDateTimeString = z.infer<typeof isoDateTimeStringSchema>;
export type NoteRecord = z.infer<typeof noteRecordSchema>;
export type NoteCreatePayload = z.infer<typeof noteCreatePayloadSchema>;
export type NoteUpdatePayload = z.infer<typeof noteUpdatePayloadSchema>;
export type NoteDeletePayload = z.infer<typeof noteDeletePayloadSchema>;
export type NoteOpPayload = z.infer<typeof noteOpPayloadSchema>;
export type NoteOp = z.infer<typeof noteOpSchema>;
export type EncryptedEnvelope = z.infer<typeof encryptedEnvelopeSchema>;
export type EnvelopeAad = z.infer<typeof envelopeAadSchema>;
export type SyncKdfParams = z.infer<typeof syncKdfParamsSchema>;
export type PersistedSyncConfig = z.infer<typeof persistedSyncConfigSchema>;
export type SyncSessionSecret = z.infer<typeof syncSessionSecretSchema>;
export type SyncCursorRecord = z.infer<typeof syncCursorRecordSchema>;
export type TatacSyncFile = z.infer<typeof tatacSyncFileSchema>;
