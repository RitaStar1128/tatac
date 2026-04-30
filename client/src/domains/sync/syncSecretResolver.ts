import { getPersistedSyncSecret } from "./persistedSyncSecretStore";
import { getSyncSessionSecret } from "./sessionSecretStore";

export async function resolveEffectiveSyncPassphrase(): Promise<string> {
  const sessionSecret = getSyncSessionSecret();
  if (sessionSecret?.passphrase) {
    return sessionSecret.passphrase;
  }

  const persistedSecret = await getPersistedSyncSecret();
  if (persistedSecret?.groupSecret) {
    return persistedSecret.groupSecret;
  }

  throw new Error("A sync secret is required before syncing or importing encrypted data.");
}
