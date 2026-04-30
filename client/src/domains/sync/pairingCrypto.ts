import {
  pairingBundlePayloadSchema,
  pairingBundleSchema,
  type PairingBundle,
  type PairingBundlePayload,
} from "@shared/contracts";
import { decodeBase64Url, encodeBase64Url } from "@shared/lib/base64url";

import { decodeBase64, encodeBase64 } from "./syncCrypto";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function getPairingCryptoKeyMaterial(pairingKey: string): Uint8Array {
  const keyBytes = decodeBase64Url(pairingKey);
  if (keyBytes.byteLength !== 32) {
    throw new Error("Invalid pairing key.");
  }
  return keyBytes;
}

async function importPairingKey(pairingKey: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", getPairingCryptoKeyMaterial(pairingKey), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

function encodePairingAad(payload: { pairingVersion: 1; createdAt: string; expiresAt: string }): Uint8Array {
  return textEncoder.encode(JSON.stringify(payload));
}

export function createPairingKey(): string {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function createPairingKeyHash(pairingKey: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", getPairingCryptoKeyMaterial(pairingKey));
  return encodeBase64Url(hashBuffer);
}

export async function encryptPairingBundle(payload: PairingBundlePayload, pairingKey: string): Promise<PairingBundle> {
  const parsedPayload = pairingBundlePayloadSchema.parse(payload);
  const key = await importPairingKey(pairingKey);
  const nonceBytes = crypto.getRandomValues(new Uint8Array(12));
  const aadBytes = encodePairingAad({
    pairingVersion: 1,
    createdAt: parsedPayload.createdAt,
    expiresAt: parsedPayload.expiresAt,
  });
  const cipherText = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonceBytes,
      additionalData: aadBytes,
      tagLength: 128,
    },
    key,
    textEncoder.encode(JSON.stringify(parsedPayload)),
  );

  return pairingBundleSchema.parse({
    pairingVersion: 1,
    nonce: encodeBase64(nonceBytes),
    cipherText: encodeBase64(cipherText),
    aad: encodeBase64(aadBytes),
    createdAt: parsedPayload.createdAt,
    expiresAt: parsedPayload.expiresAt,
  });
}

export async function decryptPairingBundle(bundle: PairingBundle, pairingKey: string): Promise<PairingBundlePayload> {
  const parsedBundle = pairingBundleSchema.parse(bundle);
  const key = await importPairingKey(pairingKey);
  const aadBytes = decodeBase64(parsedBundle.aad);

  try {
    const plainBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: decodeBase64(parsedBundle.nonce),
        additionalData: aadBytes,
        tagLength: 128,
      },
      key,
      decodeBase64(parsedBundle.cipherText),
    );

    return pairingBundlePayloadSchema.parse(JSON.parse(textDecoder.decode(plainBuffer)));
  } catch {
    throw new Error("Unable to decrypt this pairing code.");
  }
}
