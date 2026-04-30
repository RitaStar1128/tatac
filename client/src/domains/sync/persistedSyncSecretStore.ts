import {
  persistedSyncSecretSchema,
  type PersistedSyncSecret,
} from "@shared/contracts";

import { tatacDb } from "@/db/tatacDb";

function nowIso(): string {
  return new Date().toISOString();
}

export async function getPersistedSyncSecret(): Promise<PersistedSyncSecret | null> {
  const stored = await tatacDb.syncSecrets.get("active");
  return stored ? persistedSyncSecretSchema.parse(stored) : null;
}

export async function savePersistedSyncSecret(input: {
  groupSecret: string;
  origin: PersistedSyncSecret["origin"];
}): Promise<PersistedSyncSecret> {
  // TODO: Durable web storage is a UX/security tradeoff, not a secure enclave.
  const record = persistedSyncSecretSchema.parse({
    configId: "active",
    groupSecret: input.groupSecret,
    origin: input.origin,
    persistedAt: nowIso(),
  });

  await tatacDb.syncSecrets.put(record);
  return record;
}

export async function clearPersistedSyncSecret(): Promise<void> {
  await tatacDb.syncSecrets.delete("active");
}
