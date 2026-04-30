import {
  encryptedSignalingMessageAadSchema,
  encryptedSignalingMessageSchema,
  signalingPayloadSchema,
  type EncryptedSignalingMessage,
  type EncryptedSignalingMessageAad,
  type PersistedSyncConfig,
  type SignalingPayload,
} from "@shared/contracts";

import { decodeBase64, encodeBase64 } from "./syncCrypto";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

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

function buildSignalingKdfSalt(userId: string, saltBase64: string): Uint8Array {
  return concatBytes(textEncoder.encode(`signal:${userId}:`), decodeBase64(saltBase64));
}

async function deriveSignalingKey(
  config: PersistedSyncConfig,
  passphrase: string,
): Promise<CryptoKey> {
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
      salt: buildSignalingKdfSalt(config.userId, config.salt),
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

export async function encryptSignalingPayload(input: {
  payload: SignalingPayload;
  config: PersistedSyncConfig;
  passphrase: string;
  toDeviceId: string;
}): Promise<EncryptedSignalingMessage> {
  const key = await deriveSignalingKey(input.config, input.passphrase);
  const createdAt = new Date().toISOString();
  const payload = signalingPayloadSchema.parse(input.payload);
  const payloadBytes = textEncoder.encode(JSON.stringify(payload));
  const aadPayload = encryptedSignalingMessageAadSchema.parse({
    version: 1,
    kind: payload.kind,
    recipientUserId: input.config.userId,
    keyEpoch: input.config.keyEpoch,
    fromDeviceId: input.config.deviceId,
    toDeviceId: input.toDeviceId,
    createdAt,
  });
  const aadBytes = textEncoder.encode(JSON.stringify(aadPayload));
  const nonceBytes = crypto.getRandomValues(new Uint8Array(12));

  const cipherText = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonceBytes,
      additionalData: aadBytes,
      tagLength: 128,
    },
    key,
    payloadBytes,
  );

  return encryptedSignalingMessageSchema.parse({
    version: 1,
    kind: payload.kind,
    fromDeviceId: input.config.deviceId,
    toDeviceId: input.toDeviceId,
    nonce: encodeBase64(nonceBytes),
    cipherText: encodeBase64(cipherText),
    aad: encodeBase64(aadBytes),
    createdAt,
  });
}

export async function decryptSignalingPayload(input: {
  message: EncryptedSignalingMessage;
  config: PersistedSyncConfig;
  passphrase: string;
}): Promise<{ payload: SignalingPayload; aad: EncryptedSignalingMessageAad }> {
  const message = encryptedSignalingMessageSchema.parse(input.message);
  const aadBytes = decodeBase64(message.aad);
  const aad = encryptedSignalingMessageAadSchema.parse(JSON.parse(textDecoder.decode(aadBytes)));

  if (aad.recipientUserId !== input.config.userId) {
    throw new Error("Signaling message recipient does not match the active sync group.");
  }

  if (aad.keyEpoch !== input.config.keyEpoch) {
    throw new Error("Signaling message key epoch does not match the active sync epoch.");
  }

  if (aad.toDeviceId !== input.config.deviceId) {
    throw new Error("Signaling message target does not match this device.");
  }

  const key = await deriveSignalingKey(input.config, input.passphrase);

  let decrypted: ArrayBuffer;
  try {
    decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: decodeBase64(message.nonce),
        additionalData: aadBytes,
        tagLength: 128,
      },
      key,
      decodeBase64(message.cipherText),
    );
  } catch {
    throw new Error("Unable to decrypt the signaling payload.");
  }

  return {
    aad,
    payload: signalingPayloadSchema.parse(JSON.parse(textDecoder.decode(decrypted))),
  };
}
