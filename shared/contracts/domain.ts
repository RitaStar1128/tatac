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
export const groupIdSchema = userIdSchema;
export const keyEpochSchema = z.number().int().positive();
export const deviceIdSchema = opaqueIdSchema;
export const deviceNameSchema = z.string().trim().min(1).max(128);
export const nodeIdSchema = opaqueIdSchema;
export const pairingSessionIdSchema = opaqueIdSchema;
export const clientVersionSchema = z.string().trim().min(1).max(32);
export const syncNodeUrlSchema = z.url().trim();
export const syncTransportModeSchema = z.enum(["relay-only", "lan-direct"]);

export const noteRecordSchema = z
  .object({
    id: noteIdSchema,
    groupId: groupIdSchema,
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
    keyEpoch: keyEpochSchema,
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
    keyEpoch: keyEpochSchema,
    contentHash: base64StringSchema,
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
    keyEpoch: keyEpochSchema,
    contentHash: base64StringSchema,
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
    keyEpoch: keyEpochSchema,
    deviceId: deviceIdSchema,
    deviceName: deviceNameSchema,
    syncNodeUrl: syncNodeUrlSchema.nullable(),
    transportMode: syncTransportModeSchema,
    lanSyncEnabled: z.boolean(),
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

export const rtcIceServerSchema = z
  .object({
    urls: z.union([z.url().trim(), z.array(z.url().trim()).min(1)]),
    username: z.string().min(1).optional(),
    credential: z.string().min(1).optional(),
    credentialType: z.enum(["password"]).optional(),
  })
  .strict();

export const persistedSyncSecretSchema = z
  .object({
    configId: z.literal("active"),
    groupSecret: z.string().min(8),
    persistedAt: isoDateTimeStringSchema,
    origin: z.enum(["manual", "generated", "paired"]),
  })
  .strict();

export const syncCursorRecordSchema = z
  .object({
    id: z.string().min(1),
    userId: userIdSchema,
    keyEpoch: keyEpochSchema,
    syncNodeUrl: syncNodeUrlSchema,
    lastPulledSeq: nonNegativeIntSchema,
    updatedAt: isoDateTimeStringSchema,
  })
  .strict();

export const bootstrapRealtimeConfigSchema = z
  .object({
    signalingWebSocketUrl: z.url().trim(),
    iceServers: z.array(rtcIceServerSchema),
    expiresAt: isoDateTimeStringSchema.optional(),
  })
  .strict();

export const realtimePeerSchema = z
  .object({
    deviceId: deviceIdSchema,
    deviceName: deviceNameSchema,
    joinedAt: isoDateTimeStringSchema,
  })
  .strict();

export const signalingPayloadOfferSchema = z
  .object({
    kind: z.literal("offer"),
    sdp: z.string().min(1),
  })
  .strict();

export const signalingPayloadAnswerSchema = z
  .object({
    kind: z.literal("answer"),
    sdp: z.string().min(1),
  })
  .strict();

export const signalingPayloadIceCandidateSchema = z
  .object({
    kind: z.literal("ice-candidate"),
    candidate: z
      .object({
        candidate: z.string(),
        sdpMid: z.string().nullable().optional(),
        sdpMLineIndex: z.number().int().nullable().optional(),
        usernameFragment: z.string().optional(),
      })
      .strict(),
  })
  .strict();

export const signalingPayloadSchema = z.discriminatedUnion("kind", [
  signalingPayloadOfferSchema,
  signalingPayloadAnswerSchema,
  signalingPayloadIceCandidateSchema,
]);

export const encryptedSignalingMessageAadSchema = z
  .object({
    version: z.literal(1),
    kind: z.enum(["offer", "answer", "ice-candidate"]),
    recipientUserId: userIdSchema,
    keyEpoch: keyEpochSchema,
    fromDeviceId: deviceIdSchema,
    toDeviceId: deviceIdSchema,
    createdAt: isoDateTimeStringSchema,
  })
  .strict();

export const encryptedSignalingMessageSchema = z
  .object({
    version: z.literal(1),
    kind: z.enum(["offer", "answer", "ice-candidate"]),
    fromDeviceId: deviceIdSchema,
    toDeviceId: deviceIdSchema,
    nonce: base64StringSchema,
    cipherText: base64StringSchema,
    aad: base64StringSchema,
    createdAt: isoDateTimeStringSchema,
  })
  .strict();

export const realtimeDirectEnvelopeBatchSchema = z
  .object({
    type: z.literal("envelope.batch"),
    envelopes: z.array(encryptedEnvelopeSchema).min(1),
  })
  .strict();

export const realtimePresenceRegisterMessageSchema = z
  .object({
    type: z.literal("presence.register"),
    userId: userIdSchema,
    keyEpoch: keyEpochSchema,
    deviceId: deviceIdSchema,
    deviceName: deviceNameSchema,
  })
  .strict();

export const realtimePresenceLeaveMessageSchema = z
  .object({
    type: z.literal("presence.leave"),
    userId: userIdSchema,
    keyEpoch: keyEpochSchema,
    deviceId: deviceIdSchema,
  })
  .strict();

export const realtimeSignalForwardMessageSchema = z
  .object({
    type: z.literal("signal.forward"),
    userId: userIdSchema,
    keyEpoch: keyEpochSchema,
    fromDeviceId: deviceIdSchema,
    toDeviceId: deviceIdSchema,
    payload: encryptedSignalingMessageSchema,
  })
  .strict();

export const realtimePingMessageSchema = z
  .object({
    type: z.literal("ping"),
    sentAt: isoDateTimeStringSchema,
  })
  .strict();

export const realtimeClientMessageSchema = z.discriminatedUnion("type", [
  realtimePresenceRegisterMessageSchema,
  realtimePresenceLeaveMessageSchema,
  realtimeSignalForwardMessageSchema,
  realtimePingMessageSchema,
]);

export const realtimePresenceSnapshotMessageSchema = z
  .object({
    type: z.literal("presence.snapshot"),
    userId: userIdSchema,
    keyEpoch: keyEpochSchema,
    peers: z.array(realtimePeerSchema),
  })
  .strict();

export const realtimePeerJoinedMessageSchema = z
  .object({
    type: z.literal("peer.joined"),
    userId: userIdSchema,
    keyEpoch: keyEpochSchema,
    peer: realtimePeerSchema,
  })
  .strict();

export const realtimePeerLeftMessageSchema = z
  .object({
    type: z.literal("peer.left"),
    userId: userIdSchema,
    keyEpoch: keyEpochSchema,
    deviceId: deviceIdSchema,
  })
  .strict();

export const realtimeSignalDeliverMessageSchema = z
  .object({
    type: z.literal("signal.deliver"),
    userId: userIdSchema,
    keyEpoch: keyEpochSchema,
    fromDeviceId: deviceIdSchema,
    toDeviceId: deviceIdSchema,
    payload: encryptedSignalingMessageSchema,
  })
  .strict();

export const realtimeRelayHintMessageSchema = z
  .object({
    type: z.literal("relay.hint"),
    userId: userIdSchema,
    keyEpoch: keyEpochSchema,
    fromDeviceId: deviceIdSchema.optional(),
    createdAt: isoDateTimeStringSchema,
  })
  .strict();

export const realtimePongMessageSchema = z
  .object({
    type: z.literal("pong"),
    sentAt: isoDateTimeStringSchema,
  })
  .strict();

export const realtimeErrorMessageSchema = z
  .object({
    type: z.literal("error"),
    code: z.string().min(1),
    message: z.string().min(1),
  })
  .strict();

export const realtimeServerMessageSchema = z.discriminatedUnion("type", [
  realtimePresenceSnapshotMessageSchema,
  realtimePeerJoinedMessageSchema,
  realtimePeerLeftMessageSchema,
  realtimeSignalDeliverMessageSchema,
  realtimeRelayHintMessageSchema,
  realtimePongMessageSchema,
  realtimeErrorMessageSchema,
]);

export const pairingBundlePayloadSchema = z
  .object({
    pairingVersion: z.literal(1),
    syncGroupId: userIdSchema,
    keyEpoch: keyEpochSchema,
    groupSecret: z.string().min(8),
    salt: base64StringSchema,
    syncNodeUrl: syncNodeUrlSchema,
    sourceDeviceId: deviceIdSchema,
    sourceDeviceName: deviceNameSchema,
    createdAt: isoDateTimeStringSchema,
    expiresAt: isoDateTimeStringSchema,
  })
  .strict();

export const pairingBundleSchema = z
  .object({
    pairingVersion: z.literal(1),
    nonce: base64StringSchema,
    cipherText: base64StringSchema,
    aad: base64StringSchema,
    createdAt: isoDateTimeStringSchema,
    expiresAt: isoDateTimeStringSchema,
  })
  .strict();

export const pairingSessionRecordSchema = z
  .object({
    sessionId: pairingSessionIdSchema,
    pairingKeyHash: base64StringSchema,
    bundle: pairingBundleSchema,
    createdAt: isoDateTimeStringSchema,
    expiresAt: isoDateTimeStringSchema,
    consumedAt: isoDateTimeStringSchema.optional(),
  })
  .strict();

export const tatacSyncFileSchema = z
  .object({
    fileType: z.literal("tatacsync"),
    version: z.literal(1),
    exportedAt: isoDateTimeStringSchema,
    fromDeviceId: deviceIdSchema,
    userId: userIdSchema,
    keyEpoch: keyEpochSchema,
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
export type KeyEpoch = z.infer<typeof keyEpochSchema>;
export type SyncKdfParams = z.infer<typeof syncKdfParamsSchema>;
export type PersistedSyncConfig = z.infer<typeof persistedSyncConfigSchema>;
export type SyncSessionSecret = z.infer<typeof syncSessionSecretSchema>;
export type SyncTransportMode = z.infer<typeof syncTransportModeSchema>;
export type RtcIceServer = z.infer<typeof rtcIceServerSchema>;
export type PersistedSyncSecret = z.infer<typeof persistedSyncSecretSchema>;
export type SyncCursorRecord = z.infer<typeof syncCursorRecordSchema>;
export type BootstrapRealtimeConfig = z.infer<typeof bootstrapRealtimeConfigSchema>;
export type RealtimePeer = z.infer<typeof realtimePeerSchema>;
export type SignalingPayload = z.infer<typeof signalingPayloadSchema>;
export type EncryptedSignalingMessageAad = z.infer<typeof encryptedSignalingMessageAadSchema>;
export type EncryptedSignalingMessage = z.infer<typeof encryptedSignalingMessageSchema>;
export type RealtimeDirectEnvelopeBatch = z.infer<typeof realtimeDirectEnvelopeBatchSchema>;
export type RealtimeClientMessage = z.infer<typeof realtimeClientMessageSchema>;
export type RealtimeServerMessage = z.infer<typeof realtimeServerMessageSchema>;
export type PairingBundlePayload = z.infer<typeof pairingBundlePayloadSchema>;
export type PairingBundle = z.infer<typeof pairingBundleSchema>;
export type PairingSessionRecord = z.infer<typeof pairingSessionRecordSchema>;
export type TatacSyncFile = z.infer<typeof tatacSyncFileSchema>;
