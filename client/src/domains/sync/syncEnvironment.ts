export interface SyncEnvironmentSupport {
  supported: boolean;
  reason: "ok" | "requires-local-http-app" | "https-app-cannot-call-http-node";
  appOrigin: string | null;
  syncNodeOrigin: string | null;
}

function canParseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function getWindowLocationUrl(): URL | null {
  if (typeof window === "undefined") {
    return null;
  }

  return canParseUrl(window.location.href);
}

function canAppCallSyncNode(appUrl: URL, syncNodeUrl: URL): boolean {
  if (appUrl.origin === syncNodeUrl.origin) {
    return true;
  }

  if (appUrl.protocol === "https:" && syncNodeUrl.protocol !== "https:") {
    return false;
  }

  return appUrl.protocol === "http:" || syncNodeUrl.protocol === "https:";
}

export function getSyncEnvironmentSupport(syncNodeUrl?: string | null): SyncEnvironmentSupport {
  const appUrl = getWindowLocationUrl();
  if (!appUrl) {
    return {
      supported: true,
      reason: "ok",
      appOrigin: null,
      syncNodeOrigin: null,
    };
  }

  if (!syncNodeUrl) {
    return appUrl.protocol === "http:"
      ? {
          supported: true,
          reason: "ok",
          appOrigin: appUrl.origin,
          syncNodeOrigin: null,
        }
      : {
          supported: false,
          reason: "requires-local-http-app",
          appOrigin: appUrl.origin,
          syncNodeOrigin: null,
        };
  }

  const parsedSyncNodeUrl = canParseUrl(syncNodeUrl);
  if (!parsedSyncNodeUrl) {
    return {
      supported: false,
      reason: "https-app-cannot-call-http-node",
      appOrigin: appUrl.origin,
      syncNodeOrigin: null,
    };
  }

  return canAppCallSyncNode(appUrl, parsedSyncNodeUrl)
    ? {
        supported: true,
        reason: "ok",
        appOrigin: appUrl.origin,
        syncNodeOrigin: parsedSyncNodeUrl.origin,
      }
    : {
        supported: false,
        reason: "https-app-cannot-call-http-node",
        appOrigin: appUrl.origin,
        syncNodeOrigin: parsedSyncNodeUrl.origin,
      };
}

export function assertSyncEnvironmentSupported(syncNodeUrl?: string | null): void {
  const support = getSyncEnvironmentSupport(syncNodeUrl);
  if (support.supported) {
    return;
  }

  if (support.reason === "requires-local-http-app") {
    throw new Error(
      "This hosted HTTPS app cannot enable LAN sync. Open TATAC from a local HTTP URL on the PC first.",
    );
  }

  throw new Error(
    "This app cannot call the current sync node URL. Open TATAC from a compatible local URL on the PC first.",
  );
}
