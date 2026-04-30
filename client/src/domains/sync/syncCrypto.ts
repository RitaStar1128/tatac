import {
  envelopeAadSchema,
  encryptedEnvelopeSchema,
  noteOpSchema,
  type EncryptedEnvelope,
  type EnvelopeAad,
  type NoteOp,
  type PersistedSyncConfig,
} from "@shared/contracts";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function toCanonicalNoteOp(op: NoteOp): NoteOp {
  return noteOpSchema.parse({
    opId: op.opId,
    deviceId: op.deviceId,
    userId: op.userId,
    noteId: op.noteId,
    baseVersion: op.baseVersion,
    logicalTime: op.logicalTime,
    wallClock: op.wallClock,
    payload: op.payload,
  });
}

function toUint8Array(value: ArrayBuffer | Uint8Array): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

export function encodeBase64(value: ArrayBuffer | Uint8Array): string {
  const bytes = toUint8Array(value);
  let binary = "";
  for (const byte of Array.from(bytes)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function buildKdfSalt(userId: string, saltBase64: string): Uint8Array {
  return concatBytes(textEncoder.encode(`${userId}:`), decodeBase64(saltBase64));
}

export async function deriveSyncKey(config: PersistedSyncConfig, passphrase: string): Promise<CryptoKey> {
  const imported = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: config.kdf.hash,
      iterations: config.kdf.iterations,
      salt: buildKdfSalt(config.userId, config.salt),
    },
    imported,
    {
      name: "AES-GCM",
      length: config.kdf.keyLengthBits,
    },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptNoteOpToEnvelope(
  op: NoteOp,
  config: PersistedSyncConfig,
  passphrase: string,
): Promise<EncryptedEnvelope> {
  const key = await deriveSyncKey(config, passphrase);
  const createdAt = new Date().toISOString();
  const canonicalOp = toCanonicalNoteOp(op);
  const aadPayload = envelopeAadSchema.parse({
    envelopeVersion: 1,
    senderDeviceId: config.deviceId,
    recipientUserId: config.userId,
    createdAt,
  });
  const aadBytes = textEncoder.encode(JSON.stringify(aadPayload));
  const nonceBytes = crypto.getRandomValues(new Uint8Array(12));
  const opBytes = textEncoder.encode(JSON.stringify(canonicalOp));

  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonceBytes,
      additionalData: aadBytes,
      tagLength: 128,
    },
    key,
    opBytes,
  );

  return encryptedEnvelopeSchema.parse({
    envelopeVersion: 1,
    senderDeviceId: config.deviceId,
    recipientUserId: config.userId,
    nonce: encodeBase64(nonceBytes),
    cipherText: encodeBase64(encrypted),
    aad: encodeBase64(aadBytes),
    createdAt,
  });
}

export async function decryptEnvelopeToNoteOp(
  envelope: EncryptedEnvelope,
  config: PersistedSyncConfig,
  passphrase: string,
): Promise<{ op: NoteOp; aad: EnvelopeAad }> {
  const parsedEnvelope = encryptedEnvelopeSchema.parse(envelope);
  const key = await deriveSyncKey(config, passphrase);
  const aadBytes = decodeBase64(parsedEnvelope.aad);
  const aad = envelopeAadSchema.parse(JSON.parse(textDecoder.decode(aadBytes)));

  if (aad.recipientUserId !== config.userId) {
    throw new Error("Envelope recipient does not match the active sync group.");
  }

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: decodeBase64(parsedEnvelope.nonce),
      additionalData: aadBytes,
      tagLength: 128,
    },
    key,
    decodeBase64(parsedEnvelope.cipherText),
  );

  return {
    aad,
    op: noteOpSchema.parse(JSON.parse(textDecoder.decode(decrypted))),
  };
}
