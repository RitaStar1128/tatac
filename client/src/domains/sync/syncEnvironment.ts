export interface SyncEnvironmentSupport {
  supported: boolean;
  reason:
    | "ok"
    | "public-https-app-cannot-reach-http-node";
}

export function getSyncEnvironmentSupport(): SyncEnvironmentSupport {
  if (typeof window === "undefined") {
    return {
      supported: true,
      reason: "ok",
    };
  }

  if (window.location.protocol === "http:") {
    return {
      supported: true,
      reason: "ok",
    };
  }

  return {
    supported: false,
    reason: "public-https-app-cannot-reach-http-node",
  };
}

export function assertSyncEnvironmentSupported(): void {
  const support = getSyncEnvironmentSupport();
  if (support.supported) {
    return;
  }

  throw new Error(
    "This hosted HTTPS app cannot connect to the local HTTP sync node. Open TATAC from the PC on the local network first.",
  );
}
